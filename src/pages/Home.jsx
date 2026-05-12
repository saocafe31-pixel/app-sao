import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProducts } from '../hooks/useProducts'
import { useCart } from '../hooks/useCart'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import ProductCard from '../components/products/ProductCard'
import BundleSelectionModal from '../components/products/BundleSelectionModal'
import Cart from '../components/orders/Cart'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import { supabase } from '../utils/supabase'
import { normalizeProduct, normalizeProducts, filterProductsForShopCatalog } from '../utils/helpers'
import { normalizeSelectedOptions } from '../utils/productCatalog'
import { buildBundleSelectionSummary } from '../utils/bundleUtils'
import { getPricingShapeForBundlePrimary } from '../utils/priceTiers'
import { getUiTexts } from '../services/shopSettingsService'
import { cartWouldAddDifferentSupplier } from '../utils/cartSupplierUtils'

export default function Home({ user, setUser }) {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [showCart, setShowCart] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedSupplier, setSelectedSupplier] = useState('All')
  const [currentPage, setCurrentPage] = useState(1)
  const [isSearching, setIsSearching] = useState(false)
  const [isFiltering, setIsFiltering] = useState(false)
  const [allSuppliers, setAllSuppliers] = useState(['All'])
  const [filteredProductsFromDB, setFilteredProductsFromDB] = useState([])
  const [uiTexts, setUiTexts] = useState({ welcome_message: '', footer_text: '' })
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [bundleModalOpen, setBundleModalOpen] = useState(false)
  const [bundleModalProduct, setBundleModalProduct] = useState(null)
  const [bundleModalMembers, setBundleModalMembers] = useState([])
  const [bundlePrimaryStockMap, setBundlePrimaryStockMap] = useState(new Map())
  const itemsPerPage = 50

  const getBundlePrimaryId = useCallback((product) => {
    const direct = String(product?.bundlePrimaryProductId || '').trim()
    if (direct) return direct
    const lines = Array.isArray(product?.bundleLines) ? product.bundleLines : []
    const firstPid = String(lines?.[0]?.productId || '').trim()
    return firstPid
  }, [])

  useEffect(() => {
    getUiTexts().then(setUiTexts)
  }, [])
  
  const { products, loading, hasMore, search, loadMore, refresh } = useProducts(user)
  const { cart, addToCart, updateQuantity, removeFromCart, getItemCount, clearCart, updateCartStock } = useCart(user)

  const applyEffectiveBundleStock = useCallback((list, fallbackMap = new Map()) => {
    const rows = Array.isArray(list) ? list : []
    const ownStockMap = new Map()
    rows.forEach((p) => {
      if (p?.isBundle) return
      const id = String(p?.id || '').trim()
      if (!id) return
      ownStockMap.set(id, Number(p?.stock || 0))
    })
    return rows.map((p) => {
      if (!p?.isBundle) return p
      const primaryId = getBundlePrimaryId(p)
      if (!primaryId) return p
      const linked = ownStockMap.has(primaryId) ? ownStockMap.get(primaryId) : fallbackMap.get(primaryId)
      if (linked == null) return p
      return { ...p, stock: Number(linked || 0) }
    })
  }, [getBundlePrimaryId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const mergedRows = [...(products || []), ...(filteredProductsFromDB || [])]
      const seenBundleIds = new Set()
      const bundleRows = mergedRows.filter((p) => {
        if (p?.isBundle !== true) return false
        const id = String(p?.id || '').trim()
        if (!id) return false
        if (seenBundleIds.has(id)) return false
        seenBundleIds.add(id)
        return true
      })
      if (bundleRows.length === 0) {
        if (!cancelled) setBundlePrimaryStockMap(new Map())
        return
      }
      const ownStockMap = new Map()
      mergedRows.forEach((p) => {
        if (p?.isBundle) return
        const id = String(p?.id || '').trim()
        if (id) ownStockMap.set(id, Number(p?.stock || 0))
      })
      const missingPrimaryIds = [...new Set(
        bundleRows
          .map((b) => getBundlePrimaryId(b))
          .filter(Boolean)
          .filter((pid) => !ownStockMap.has(pid))
      )]
      if (missingPrimaryIds.length === 0) {
        if (!cancelled) setBundlePrimaryStockMap(new Map())
        return
      }
      try {
        const { data, error } = await supabase
          .from('products')
          .select('ProductID, Stock')
          .in('ProductID', missingPrimaryIds)
        if (error) throw error
        const m = new Map()
        ;(data || []).forEach((r) => {
          const pid = String(r?.ProductID || '').trim()
          if (!pid) return
          m.set(pid, Number(r?.Stock || 0))
        })
        if (!cancelled) setBundlePrimaryStockMap(m)
      } catch (e) {
        console.error('Failed to fetch hidden bundle primary stocks:', e)
        if (!cancelled) setBundlePrimaryStockMap(new Map())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [products, filteredProductsFromDB, getBundlePrimaryId])

  const primaryStockLookup = useMemo(() => {
    const m = new Map(bundlePrimaryStockMap || [])
    ;(products || []).forEach((p) => {
      if (p?.isBundle) return
      const id = String(p?.id || '').trim()
      if (!id) return
      m.set(id, Number(p?.stock || 0))
    })
    return m
  }, [products, bundlePrimaryStockMap])

  const productsWithEffectiveStock = useMemo(
    () => applyEffectiveBundleStock(products, primaryStockLookup),
    [products, primaryStockLookup, applyEffectiveBundleStock]
  )

  const productsStockMap = useMemo(() => {
    const map = new Map()
    productsWithEffectiveStock.forEach((p) => {
      const id = String(p?.id || '').trim()
      if (!id) return
      map.set(id, Number(p?.stock || 0))
    })
    return map
  }, [productsWithEffectiveStock])

  const filteredProductsFromDBWithEffectiveStock = useMemo(
    () => applyEffectiveBundleStock(filteredProductsFromDB, primaryStockLookup),
    [filteredProductsFromDB, primaryStockLookup, applyEffectiveBundleStock]
  )

  const getSelectedOptionsExtraPrice = useCallback((product, selectedOptions) => {
    const opts = selectedOptions && typeof selectedOptions === 'object' ? selectedOptions : {}
    const groups = Array.isArray(product?.productOptions) ? product.productOptions : []
    let total = 0
    for (const group of groups) {
      const chosen = String(opts[group?.name] || '').trim()
      if (!chosen) continue
      const match = (group.values || []).find((v) => String(v?.label ?? v ?? '').trim() === chosen)
      total += Number(match?.price ?? 0) || 0
    }
    return total
  }, [])
  
  // Update cart stock when products are loaded
  useEffect(() => {
    if (productsWithEffectiveStock.length > 0 && cart.length > 0) {
      updateCartStock(productsWithEffectiveStock)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsWithEffectiveStock])

  // Listen for order placed event to refresh products
  useEffect(() => {
    const handleOrderPlaced = () => {
      console.log('Order placed event received, refreshing products...')
      // Small delay to ensure database is updated
      setTimeout(() => {
        refresh() // Force refresh products to get updated stock
      }, 500)
    }

    window.addEventListener('orderPlaced', handleOrderPlaced)

    return () => {
      window.removeEventListener('orderPlaced', handleOrderPlaced)
    }
  }, [refresh])

  // Fetch all suppliers from products table on mount (don't wait for products to load)
  useEffect(() => {
    const fetchAllSuppliers = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('Supplier')
          .not('Supplier', 'is', null)
          .neq('Supplier', '')

        if (error) {
          console.error('Error fetching suppliers:', error)
          return
        }

        // Get unique suppliers
        const uniqueSuppliersSet = new Set()
        if (data) {
          data.forEach(product => {
            const supplier = product.Supplier || product.supplier
            if (supplier && supplier.trim() !== '') {
              uniqueSuppliersSet.add(supplier.trim())
            }
          })
        }

        // Convert to sorted array and add 'All' option
        const suppliersArray = ['All', ...Array.from(uniqueSuppliersSet).sort()]
        setAllSuppliers(suppliersArray)
      } catch (error) {
        console.error('Error fetching suppliers:', error)
      }
    }

    fetchAllSuppliers()
  }, []) // Only run once on mount

  // Refresh products when navigating back to home page
  useEffect(() => {
    // Refresh when component mounts or when user changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Refresh when tab becomes visible
        refresh()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // Initial refresh on mount
    refresh()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]) // Refresh when user changes
  
  // Get unique categories and suppliers
  const uniqueCategories = useMemo(() => {
    const cats = ['All', ...new Set(productsWithEffectiveStock.map(p => p.category).filter(Boolean))]
    return cats
  }, [productsWithEffectiveStock])
  
  // Use suppliers from database (allSuppliers) instead of waiting for products to load
  // Also merge with suppliers from loaded products to ensure we have all suppliers
  const uniqueSuppliers = useMemo(() => {
    const suppliersSet = new Set(allSuppliers) // Start with suppliers from database
    
    // Add suppliers from loaded products (in case new suppliers were added)
    productsWithEffectiveStock.forEach(p => {
      if (p.supplier && p.supplier.trim() !== '') {
        suppliersSet.add(p.supplier.trim())
      }
    })
    
    // Convert to sorted array, ensuring 'All' is first
    const suppliersArray = Array.from(suppliersSet)
    if (!suppliersArray.includes('All')) {
      suppliersArray.unshift('All')
    } else {
      // Move 'All' to the front
      const allIndex = suppliersArray.indexOf('All')
      if (allIndex > 0) {
        suppliersArray.splice(allIndex, 1)
        suppliersArray.unshift('All')
      }
    }
    
    return suppliersArray.sort((a, b) => {
      if (a === 'All') return -1
      if (b === 'All') return 1
      return a.localeCompare(b)
    })
  }, [allSuppliers, productsWithEffectiveStock])
  
  // Fetch products from database when supplier is selected or search term is entered
  useEffect(() => {
    const fetchFilteredProducts = async () => {
      // Only fetch from DB if supplier is selected or search term exists
      const shouldFetchFromDB = selectedSupplier !== 'All' || (searchTerm && searchTerm.trim() !== '')
      
      if (!shouldFetchFromDB) {
        setFilteredProductsFromDB([])
        setIsFiltering(false)
        return
      }

      setIsFiltering(true)
      try {
        let query = supabase
          .from('products')
          .select('*')

        // Apply search filter
        if (searchTerm && searchTerm.trim()) {
          const searchTermValue = searchTerm.trim()
          query = query.or(`ProductName.ilike.%${searchTermValue}%,Category.ilike.%${searchTermValue}%,Supplier.ilike.%${searchTermValue}%,ProductID.ilike.%${searchTermValue}%`)
        }

        // Apply supplier filter
        if (selectedSupplier !== 'All') {
          query = query.eq('Supplier', selectedSupplier)
        }

        // Order by ProductName
        query = query.order('ProductName', { ascending: true })

        const { data, error } = await query

        if (error) {
          console.error('Error fetching filtered products:', error)
          setFilteredProductsFromDB([])
          return
        }

        // Get userType from user object
        const userType = user?.userType || user?.customerType || 'regular'
        const normalized = normalizeProducts(data || [], userType)
        setFilteredProductsFromDB(filterProductsForShopCatalog(normalized, user))
      } catch (error) {
        console.error('Error fetching filtered products:', error)
        setFilteredProductsFromDB([])
      } finally {
        setIsFiltering(false)
      }
    }

    // Debounce the fetch
    const timeoutId = setTimeout(() => {
      fetchFilteredProducts()
    }, 300) // Wait 300ms after user stops typing/selecting

    return () => clearTimeout(timeoutId)
  }, [selectedSupplier, searchTerm, user])

  // Filter products based on category and supplier
  const filteredProducts = useMemo(() => {
    // If supplier is selected or search term exists, use products from DB
    const sourceProducts = (selectedSupplier !== 'All' || (searchTerm && searchTerm.trim() !== '')) 
      ? filteredProductsFromDBWithEffectiveStock
      : productsWithEffectiveStock
    
    let filtered = sourceProducts
    
    // Apply category filter
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(p => p.category === selectedCategory)
    }
    
    return filtered
  }, [productsWithEffectiveStock, filteredProductsFromDBWithEffectiveStock, selectedCategory, selectedSupplier, searchTerm])
  
  // Display all loaded products (no client-side pagination when loading from server)
  // Only use client-side pagination when all products are loaded (hasMore === false)
  const displayedProducts = useMemo(() => {
    if (hasMore) {
      // When still loading from server, show all loaded products
      return filteredProducts
    } else {
      // When all products loaded, use client-side pagination
      const start = (currentPage - 1) * itemsPerPage
      const end = start + itemsPerPage
      return filteredProducts.slice(start, end)
    }
  }, [filteredProducts, currentPage, hasMore])
  
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage)
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedCategory, selectedSupplier])
  
  // Handle search change - no longer need to call search() since we fetch from DB in useEffect
  const handleSearchChange = (value) => {
    setSearchTerm(value)
  }

  const handleSearch = (e) => {
    e.preventDefault()
    // Search is handled by useEffect that watches searchTerm
  }

  /** โหลดสมาชิกชุดแล้วเปิด BundleSelectionModal — ใช้ทั้งจากการ์ดสินค้าและจากตะกร้า (สั่งชุดใหม่) */
  const openBundleProductModal = useCallback(
    async (product) => {
      if (!product?.isBundle) return false
      const bundleIds = Array.isArray(product.bundleLines)
        ? product.bundleLines.map((l) => String(l?.productId || '').trim()).filter(Boolean)
        : []
      if (bundleIds.length === 0) {
        await Swal.fire({ icon: 'error', title: 'Bundle ตั้งค่าไม่ครบ', text: 'ไม่พบรายการสมาชิกชุด' })
        return false
      }

      const { data: bundleRows, error: bundleErr } = await supabase
        .from('products')
        .select('*')
        .in('ProductID', bundleIds)
      if (bundleErr) {
        await Swal.fire({ icon: 'error', title: 'โหลดข้อมูลชุดไม่สำเร็จ', text: bundleErr.message })
        return false
      }
      const userType = user?.userType || user?.customerType || 'regular'
      const normalizedBundleRows = normalizeProducts(bundleRows || [], userType)
      setBundleModalProduct(product)
      setBundleModalMembers(normalizedBundleRows)
      setBundleModalOpen(true)
      return true
    },
    [user]
  )

  /** หาโปรไฟล์สินค้าชุดจากรายการที่โหลดหรือจาก DB */
  const resolveProductForBundleModal = useCallback(
    async (productId) => {
      const pid = String(productId || '').trim()
      if (!pid) return null
      const fromList =
        productsWithEffectiveStock.find((p) => p.id === pid) || filteredProducts.find((p) => p.id === pid)
      if (fromList?.isBundle) return fromList
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('ProductID', pid)
          .limit(1)
        if (error || !data?.[0]) return fromList || null
        const userType = user?.userType || user?.customerType || 'regular'
        const p = normalizeProduct(data[0], userType)
        const vis = filterProductsForShopCatalog([p], user)
        return vis[0] || p
      } catch {
        return fromList || null
      }
    },
    [user, productsWithEffectiveStock, filteredProducts]
  )

  /** ลบแถวชุดในตะกร้าแล้วเปิด modal เลือกชุดใหม่ (ยืนยันแล้วจาก Cart — ไม่แสดง Swal ซ้ำ) */
  const handleBundleReconfigureFromCart = useCallback(
    async (cartItem) => {
      removeFromCart(cartItem.lineId || cartItem.id)
      setShowCart(false)
      const pid = cartItem.productId || cartItem.id
      const product = await resolveProductForBundleModal(pid)
      if (!product?.isBundle) {
        await Swal.fire({
          icon: 'warning',
          title: 'ไม่พบสินค้าชุด',
          text: 'โปรดเลือกสินค้าชุดจากหน้าร้านอีกครั้ง'
        })
        return
      }
      await openBundleProductModal(product)
    },
    [removeFromCart, resolveProductForBundleModal, openBundleProductModal]
  )
  
  const handleAddToCart = async (product) => {
    const orderStep = Math.max(1, product.orderStep || 1)

    // Bundle (fixed/flexible): ใช้ modal แยกจาก Swal เพื่อ UX ที่ดีขึ้น
    if (product.isBundle) {
      await openBundleProductModal(product)
      return
    }

    if (product.stock <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ขออภัย',
        text: 'สินค้าหมดสต็อก',
        confirmButtonText: 'ตกลง'
      })
      return
    }

    // รวมทุกบรรทัดที่เป็นสินค้าเดียวกัน (รวมตัวเลือกต่างกัน) เพื่อกันสั่งเกินสต็อก
    const currentQtyInCart = cart
      .filter(item => (item.productId || item.id) === product.id)
      .reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
    const availableStock = product.stock - currentQtyInCart

    if (availableStock <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'เกินสต็อก',
        text: `สินค้านี้มีในตะกร้า ${currentQtyInCart} ${product.unit || 'ชิ้น'} แล้ว และสต็อกมีเพียง ${product.stock} ${product.unit || 'ชิ้น'} เท่านั้น`,
        confirmButtonText: 'ตกลง'
      })
      return
    }

    const defaultQty = Math.min(orderStep, availableStock)
    const { value: formValue } = await Swal.fire({
      title: product.name,
      text: orderStep > 1
        ? `สั่งได้ทีละ ${orderStep} ${product.unit || 'ชิ้น'} (เหลือ ${availableStock} ${product.unit || 'ชิ้น'}${currentQtyInCart > 0 ? `, มีในตะกร้า ${currentQtyInCart} ${product.unit || 'ชิ้น'}` : ''})`
        : `ระบุจำนวน (เหลือ ${availableStock} ${product.unit || 'ชิ้น'}${currentQtyInCart > 0 ? `, มีในตะกร้า ${currentQtyInCart} ${product.unit || 'ชิ้น'}` : ''})`,
      html: `
        <div class="text-left space-y-2">
          <label class="block text-sm font-bold">จำนวน</label>
          <input id="swal-qty" type="number" min="${orderStep}" max="${availableStock}" step="${orderStep}" value="${defaultQty}" class="swal2-input" style="margin:0;width:100%" />
          ${
            Array.isArray(product.productOptions) && product.productOptions.length > 0
              ? product.productOptions.map((opt, i) => `
                  <label class="block text-sm font-bold mt-2">${opt.name}${opt.required ? ' *' : ''}</label>
                  <select id="swal-opt-${i}" class="swal2-input" style="margin:0;width:100%">
                    <option value="">${opt.required ? 'กรุณาเลือก' : 'ไม่ระบุ'}</option>
                    ${(opt.values || []).map((v) => {
                      const label = v?.label || v || ''
                      const price = Number(v?.price ?? 0) || 0
                      const priceText = price > 0 ? ` (+${price.toLocaleString()} บาท)` : ''
                      return `<option value="${label}">${label}${priceText}</option>`
                    }).join('')}
                  </select>
                `).join('')
              : ''
          }
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'เพิ่มลงตะกร้า',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#16a34a',
      preConfirm: () => {
        const qtyEl = document.getElementById('swal-qty')
        const value = qtyEl ? qtyEl.value : ''
        if (!value || parseInt(value, 10) <= 0) {
          Swal.showValidationMessage('กรุณาระบุจำนวนที่มากกว่า 0')
          return false
        }
        const qty = parseInt(value, 10)
        if (qty > availableStock) {
          Swal.showValidationMessage(`ระบุจำนวนได้ไม่เกิน ${availableStock} (รวมกับที่มีในตะกร้าแล้ว)`)
          return false
        }
        if (qty % orderStep !== 0) {
          Swal.showValidationMessage(`สินค้านี้สั่งได้ทีละ ${orderStep} ${product.unit || 'ชิ้น'} เท่านั้น (เช่น ${orderStep}, ${orderStep * 2}, ...)`)
          return false
        }
        const selectedOptions = {}
        if (Array.isArray(product.productOptions)) {
          for (let i = 0; i < product.productOptions.length; i += 1) {
            const opt = product.productOptions[i]
            const el = document.getElementById(`swal-opt-${i}`)
            const val = (el?.value || '').trim()
            if (opt.required && !val) {
              Swal.showValidationMessage(`กรุณาเลือกตัวเลือก: ${opt.name}`)
              return false
            }
            if (val) selectedOptions[opt.name] = val
          }
        }
        const optionExtraPrice = getSelectedOptionsExtraPrice(product, selectedOptions)
        return { qty, selectedOptions, optionExtraPrice }
      }
    })

    if (formValue && Number(formValue.qty) > 0) {
      let qty = parseInt(formValue.qty, 10)
      const step = product.orderStep || 1
      qty = Math.round(qty / step) * step
      if (qty < step) qty = step
      if (qty > availableStock) {
        Swal.fire({
          icon: 'warning',
          title: 'เกินสต็อก',
          text: `ระบุจำนวนได้ไม่เกิน ${availableStock} (รวมกับที่มีในตะกร้าแล้ว)`,
          confirmButtonText: 'ตกลง'
        })
        return
      }
      const optionExtraPrice = Number(formValue.optionExtraPrice || 0)
      const lineProduct = { ...product, optionExtraPerUnit: optionExtraPrice }
      if (cartWouldAddDifferentSupplier(cart, lineProduct)) {
        const confirmAdd = await Swal.fire({
          icon: 'question',
          title: 'สินค้าคนละ Supplier',
          text: 'สินค้านี้อยู่คนละ Supplier กับสินค้าในตะกร้า ต้องการเพิ่มลงตะกร้าหรือไม่? เมื่อชำระเงินสามารถเลือกชำระรวมหรือแยกตาม Supplier ได้ และระบบจะสร้างเลขออเดอร์แยกกันต่อ Supplier',
          showCancelButton: true,
          confirmButtonText: 'เพิ่มลงตะกร้า',
          cancelButtonText: 'ยกเลิก',
          confirmButtonColor: '#16a34a'
        })
        if (!confirmAdd.isConfirmed) return
      }
      addToCart(lineProduct, qty, normalizeSelectedOptions(formValue.selectedOptions))
      Swal.fire({
        icon: 'success',
        title: 'เพิ่มลงตะกร้าแล้ว',
        timer: 1500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      })
    }
  }

  const handleConfirmBundle = async (payload) => {
    const p = bundleModalProduct
    if (!p || !payload) return
    const optionExtraPrice = getSelectedOptionsExtraPrice(p, payload.selectedOptions)
    const confirmDifferentSupplier = async (lineProduct) => {
      if (!cartWouldAddDifferentSupplier(cart, lineProduct)) return true
      const confirmAdd = await Swal.fire({
        icon: 'question',
        title: 'สินค้าคนละ Supplier',
        text: 'สินค้านี้อยู่คนละ Supplier กับสินค้าในตะกร้า ต้องการเพิ่มลงตะกร้าหรือไม่? เมื่อชำระเงินสามารถเลือกชำระรวมหรือแยกตาม Supplier ได้ และระบบจะสร้างเลขออเดอร์แยกกันต่อ Supplier',
        showCancelButton: true,
        confirmButtonText: 'เพิ่มลงตะกร้า',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#16a34a'
      })
      return confirmAdd.isConfirmed
    }
    if (payload.mode === 'flexible') {
      const primaryQty = Number(payload.primaryQty || 0)
      const primary = bundleModalMembers.find((x) => x.id === p.bundlePrimaryProductId)
      const tierBasis = getPricingShapeForBundlePrimary(p, primary)
      const lineProduct = {
        ...p,
        tierBasis: tierBasis || undefined,
        optionExtraPerUnit: optionExtraPrice
      }
      if (!(await confirmDifferentSupplier(lineProduct))) return
      addToCart(
        lineProduct,
        primaryQty,
        normalizeSelectedOptions(payload.selectedOptions),
        payload.bundleSelections,
        payload.summary || buildBundleSelectionSummary(payload.bundleSelections, new Map(bundleModalMembers.map((x) => [x.id, x])))
      )
    } else {
      const primary = bundleModalMembers.find((x) => x.id === p.bundlePrimaryProductId)
      const tierBasis = getPricingShapeForBundlePrimary(p, primary)
      const lineProduct = {
        ...p,
        tierBasis: tierBasis || undefined,
        optionExtraPerUnit: optionExtraPrice
      }
      if (!(await confirmDifferentSupplier(lineProduct))) return
      addToCart(
        lineProduct,
        Number(payload.orderQty || 0),
        normalizeSelectedOptions(payload.selectedOptions),
        payload.bundleSelections,
        payload.summary || buildBundleSelectionSummary(payload.bundleSelections, new Map(bundleModalMembers.map((x) => [x.id, x])))
      )
    }
    setBundleModalOpen(false)
    setBundleModalProduct(null)
    setBundleModalMembers([])
    Swal.fire({
      icon: 'success',
      title: 'เพิ่มลงตะกร้าแล้ว',
      timer: 1200,
      showConfirmButton: false,
      toast: true,
      position: 'top-end'
    })
  }
  
  const handleProductClick = (product) => {
    handleAddToCart(product)
  }

  const handleCheckout = () => {
    if (cart.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ตะกร้าว่าง',
        text: 'กรุณาเพิ่มสินค้าลงตะกร้าก่อน',
        confirmButtonText: 'ตกลง'
      })
      return
    }
    setShowCart(false)
    navigate('/checkout')
  }

  // Check if user is franchise (has sidebar)
  const isFranchise = user?.userType === 'franchise' || user?.customerType === 'franchise'
  
  return (
    <div className={`min-h-screen bg-gray-50 ${isFranchise ? '' : 'pb-20'}`}>
      <Header 
        user={user} 
        cartItemCount={getItemCount()} 
        onCartClick={() => setShowCart(true)} 
      />
      {isFranchise && <Sidebar user={user} onMobileOpenChange={setSidebarMobileOpen} />}

      <div className={`max-w-7xl mx-auto px-4 py-6 transition-[margin] duration-300 ${isFranchise ? 'ml-0 md:ml-64' : ''} ${isFranchise && sidebarMobileOpen ? 'md:ml-64 ml-64' : ''}`}>
        {uiTexts.welcome_message && (
          <div className="mb-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100 text-gray-700">
            {uiTexts.welcome_message}
          </div>
        )}
        {/* Search and Filters - Sticky */}
        <div className="sticky top-16 z-40 flex flex-col gap-4 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100 -mx-4 px-4">
          {/* Search Bar */}
          <div className="relative">
            <Icon icon="fa-search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="ค้นหาชื่อสินค้า..."
                className="w-full pl-10 pr-10 p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-gray-800 outline-none transition"
              />
              {isSearching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <Icon icon="fa-spinner" className="animate-spin" />
                </span>
              )}
            </div>
          </div>
          
          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {uniqueCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-gray-800 text-white shadow'
                    : 'bg-white border text-gray-600 hover:bg-gray-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          
          {/* Supplier Filter */}
          <div className="relative">
            <select
              className="w-full p-2 pl-3 pr-10 border rounded-lg bg-gray-50 text-sm appearance-none outline-none focus:ring-2 focus:ring-gray-800 transition text-gray-700"
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
            >
              {uniqueSuppliers.map((sup) => (
                <option key={sup} value={sup}>
                  {sup === 'All' ? 'ร้านค้า/ซัพพลายเออร์ทั้งหมด' : sup}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
              <Icon icon="fa-chevron-down" className="text-xs" />
            </div>
          </div>
        </div>

        {/* Loading State */}
        {(isSearching || isFiltering) && (searchTerm.trim() !== '' || selectedSupplier !== 'All') && (
          <div className="text-center py-8 text-gray-500">
            <Icon icon="fa-spinner" className="animate-spin text-2xl mb-2" />
            <p>กำลังค้นหา...</p>
          </div>
        )}
        
        {/* No Results */}
        {!isSearching && !isFiltering && (searchTerm.trim() !== '' || selectedSupplier !== 'All') && filteredProducts.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Icon icon="fa-search" className="text-2xl mb-2" />
            <p>ไม่พบสินค้าที่ค้นหา</p>
          </div>
        )}
        
        {/* Products Grid */}
        {(!isSearching && !isFiltering) && (
          <>
            {loading && products.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
                <p className="mt-4 text-gray-600">กำลังโหลดสินค้า...</p>
              </div>
            ) : displayedProducts.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl">
                <Icon icon="fa-box-open" className="text-5xl text-gray-300 mb-4" />
                <p className="text-gray-600">ไม่พบสินค้า</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                  {displayedProducts.map((product) => (
                    <div
                      key={product.id}
                      onClick={() => handleProductClick(product)}
                      className="cursor-pointer"
                    >
                      <ProductCard
                        product={product}
                        onAddToCart={handleAddToCart}
                        user={user}
                      />
                    </div>
                  ))}
                </div>

                {/* Load More Button - Server-side pagination */}
                {hasMore && !isSearching && !isFiltering && selectedSupplier === 'All' && !searchTerm.trim() && (
                  <div className="flex justify-center mt-6 mb-8">
                    <button
                      onClick={loadMore}
                      disabled={loading}
                      className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
                    >
                      {loading ? (
                        <>
                          <Icon icon="fa-spinner" className="animate-spin" />
                          <span>กำลังโหลด...</span>
                        </>
                      ) : (
                        <>
                          <Icon icon="fa-arrow-down" />
                          <span>แสดงสินค้าเพิ่ม</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Client-side Pagination - Only show when not loading more from server */}
                {!hasMore && filteredProducts.length > itemsPerPage && (
                  <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 px-2 pb-8 border-t border-gray-200 pt-4 text-gray-500">
                    <div className="text-xs">
                      แสดง {Math.min((currentPage - 1) * itemsPerPage + 1, filteredProducts.length)} - {Math.min(currentPage * itemsPerPage, filteredProducts.length)} จาก {filteredProducts.length} รายการ
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 transition"
                      >
                        <Icon icon="fa-chevron-left" />
                      </button>
                      <span className="px-3 py-1 text-sm bg-white border rounded flex items-center">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 transition"
                      >
                        <Icon icon="fa-chevron-right" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
        {uiTexts.footer_text && (
          <footer className="mt-8 pt-6 border-t border-gray-200 text-center text-gray-500 text-sm">
            {uiTexts.footer_text}
          </footer>
        )}
      </div>

      {/* Cart Modal */}
      {showCart && (
        <Cart
          cart={cart}
          onUpdateQuantity={updateQuantity}
          onRemove={removeFromCart}
          onClose={() => setShowCart(false)}
          onCheckout={handleCheckout}
          onBundleReconfigure={handleBundleReconfigureFromCart}
          user={user}
        />
      )}

      <BundleSelectionModal
        open={bundleModalOpen}
        product={bundleModalProduct}
        memberProducts={bundleModalMembers}
        user={user}
        onClose={() => {
          setBundleModalOpen(false)
          setBundleModalProduct(null)
          setBundleModalMembers([])
        }}
        onConfirm={handleConfirmBundle}
      />

      {/* Bottom Navigation - Only for regular users */}
      {!isFranchise && <Sidebar user={user} />}
    </div>
  )
}
