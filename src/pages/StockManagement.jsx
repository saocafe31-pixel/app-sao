import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { productService } from '../services/productService'
import { imageService } from '../services/imageService'
import { generateProductQrDataUrl, downloadQrImage } from '../utils/productQr'
import { supplierService } from '../services/supplierService'
import { supabase } from '../utils/supabase'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import NumericTextField from '../components/common/NumericTextField'
import Swal from 'sweetalert2'
import LoadingSpinner from '../components/common/LoadingSpinner'
import {
  parseAllowedViewerEmailsFromText,
  serializeAllowedViewerEmailsToJson,
  parseProductOptions
} from '../utils/productCatalog'
import { sanitizePriceTiersForDb, MAX_PRICE_TIERS } from '../utils/priceTiers'
import AllowedViewerEmailPicker from '../components/admin/AllowedViewerEmailPicker'
import {
  ADMIN_MODAL_OVERLAY,
  ADMIN_MODAL_PANEL,
  ADMIN_MODAL_HEADER,
  ADMIN_MODAL_BODY,
  ADMIN_MODAL_FOOTER
} from '../utils/adminModalLayout'
import {
  ADMIN_PAGE_ROOT,
  ADMIN_PAGE_BODY,
  ADMIN_MAIN_COLUMN,
  ADMIN_MAIN_INNER,
  ADMIN_TOOLBAR,
  ADMIN_FILTERS,
  ADMIN_CONTENT_GROW,
  ADMIN_TABLE_FRAME,
  ADMIN_TABLE_HEAD
} from '../utils/adminPageLayout'

function buildEmptyForm() {
  return {
    id: '',
    name: '',
    price: '',
    cost: '',
    stock: '',
    image: '',
    category: '',
    detail: '',
    supplier: '',
    unit: 'ชิ้น',
    weight: '',
    minStock: '5',
    franchisePrice: '',
    orderStep: '1',
    shopHidden: false,
    visibleRegular: true,
    visibleFranchise: true,
    saleRestrictedToUsers: false,
    allowedViewerEmailsText: '',
    productOptionRows: [],
    priceTierRows: []
  }
}

function buildPriceTiersFromFormRows(rows) {
  const out = []
  for (const r of rows || []) {
    const minQty = parseInt(String(r?.minQty ?? '').trim(), 10)
    const price = Number(String(r?.price ?? '').trim())
    const fpRaw = String(r?.franchisePrice ?? '').trim()
    const franchisePrice = fpRaw === '' ? null : Number(fpRaw)
    if (!Number.isFinite(minQty) || minQty <= 0) continue
    if (!Number.isFinite(price) || price < 0) continue
    const row = { minQty, price }
    if (franchisePrice != null && Number.isFinite(franchisePrice) && franchisePrice >= 0) {
      row.franchisePrice = franchisePrice
    }
    if (r?.perMinQtyLot === true) row.perMinQtyLot = true
    const dup = out.findIndex((x) => x.minQty === minQty)
    if (dup >= 0) out[dup] = row
    else out.push(row)
  }
  return out.sort((a, b) => a.minQty - b.minQty).slice(0, MAX_PRICE_TIERS)
}

function mapProductOptionsToRows(productOptions) {
  const groups = parseProductOptions(productOptions)
  return groups.map((g) => ({
    name: g.name || '',
    required: Boolean(g.required),
    values: (g.values || [])
      .map((v) => ({
        label: String(v?.label ?? v ?? '').trim(),
        price: String(Number(v?.price ?? 0) || 0)
      }))
      .filter((v) => Boolean(v.label))
  }))
}

function parseCsvLine(line) {
  const out = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  out.push(current)
  return out.map((v) => String(v ?? '').trim())
}

function parseCsvText(text) {
  const safe = String(text || '').replace(/^\uFEFF/, '')
  const lines = safe
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
  return lines.slice(1).map((line, idx) => {
    const values = parseCsvLine(line)
    const row = { __row: idx + 2 }
    headers.forEach((h, i) => {
      row[h] = values[i] ?? ''
    })
    return row
  })
}

function toBool(value, fallback = false) {
  const s = String(value ?? '').trim().toLowerCase()
  if (!s) return fallback
  if (['1', 'true', 'yes', 'y'].includes(s)) return true
  if (['0', 'false', 'no', 'n'].includes(s)) return false
  return fallback
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function toCsvCell(value) {
  const text = String(value ?? '')
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

const STOCK_VIEW_ALL = 'all'
const STOCK_VIEW_BY_SUPPLIER = 'by_supplier'
const SUPPLIER_UNASSIGNED_LABEL = 'ไม่ระบุซัพพลาย'

function getProductSupplierName(product) {
  const name = String(product?.supplier || product?.Supplier || '').trim()
  return name || SUPPLIER_UNASSIGNED_LABEL
}

export default function StockManagement({ user }) {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false)
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newSupplierName, setNewSupplierName] = useState('')
  const [sortBy, setSortBy] = useState('id') // 'id' | 'name'
  const [sortOrder, setSortOrder] = useState('asc') // 'asc' | 'desc'
  const [stockViewMode, setStockViewMode] = useState(STOCK_VIEW_ALL)
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [formData, setFormData] = useState(buildEmptyForm)
  const [isImportingCsv, setIsImportingCsv] = useState(false)
  const csvInputRef = useRef(null)
  const itemsPerPage = 15
  const isEditingBundleProduct = editingProduct?.isBundle === true
  const linkedBundlePrimaryStock = useMemo(() => {
    if (!isEditingBundleProduct) return null
    const primaryId = String(editingProduct?.bundlePrimaryProductId || '').trim()
    if (!primaryId) return null
    const primary = (products || []).find((p) => String(p?.id || '').trim() === primaryId)
    if (!primary) return null
    return Number(primary.stock || 0)
  }, [isEditingBundleProduct, editingProduct, products])
  const basePricePreview = Number(formData.price || 0) || 0
  const previewSelectedMap = (formData.productOptionRows || []).reduce((acc, row) => {
    const optionName = String(row?.name || '').trim()
    if (!optionName) return acc
    const firstValue = (Array.isArray(row.values) ? row.values : []).find((v) => String(v?.label || '').trim())
    if (firstValue) {
      acc[optionName] = {
        label: String(firstValue.label || '').trim(),
        price: Number(firstValue.price || 0) || 0
      }
    }
    return acc
  }, {})
  const previewExtraPrice = Object.values(previewSelectedMap).reduce((sum, x) => sum + (Number(x.price || 0) || 0), 0)
  const previewFinalPrice = basePricePreview + previewExtraPrice

  useEffect(() => {
    fetchProducts()
    fetchCategories()
    fetchSuppliers()
  }, [])

  // Debounced search (โหมดทั้งหมด = API · โหมดซัพ = กรองในเครื่อง)
  useEffect(() => {
    if (stockViewMode === STOCK_VIEW_BY_SUPPLIER) {
      setIsSearching(false)
      return
    }
    if (searchTerm.trim() === '') {
      fetchProducts()
      return
    }

    setIsSearching(true)
    const timeout = setTimeout(() => {
      searchProducts(searchTerm)
    }, 500)

    return () => clearTimeout(timeout)
  }, [searchTerm, stockViewMode])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      // Fetch all products without pagination limit
      const data = await productService.getAllProducts(user, '')
      setProducts(data)
    } catch (error) {
      console.error('Error fetching products:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลสินค้าได้'
      })
    } finally {
      setLoading(false)
      setIsSearching(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('Category')
        .not('Category', 'is', null)
        .neq('Category', '')

      if (error) {
        console.error('Error fetching categories:', error)
        return
      }

      // Get unique categories
      const uniqueCategories = new Set()
      if (data) {
        data.forEach(product => {
          const category = product.Category || product.category
          if (category && category.trim() !== '') {
            uniqueCategories.add(category.trim())
          }
        })
      }

      const categoriesArray = Array.from(uniqueCategories).sort()
      setCategories(categoriesArray)
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  const fetchSuppliers = async () => {
    try {
      const data = await supplierService.getAllSuppliers()
      setSuppliers(data)
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }

  const handleAddCategory = async () => {
    if (!newCategoryName || newCategoryName.trim() === '') {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุชื่อหมวดหมู่',
        text: 'กรุณากรอกชื่อหมวดหมู่'
      })
      return
    }

    const trimmedName = newCategoryName.trim()
    
    // Check if category already exists
    if (categories.includes(trimmedName)) {
      Swal.fire({
        icon: 'info',
        title: 'หมวดหมู่มีอยู่แล้ว',
        text: `หมวดหมู่ "${trimmedName}" มีอยู่ในระบบแล้ว`
      })
      setNewCategoryName('')
      setIsAddCategoryModalOpen(false)
      setFormData({ ...formData, category: trimmedName })
      return
    }

    try {
      // Add to categories list
      const updatedCategories = [...categories, trimmedName].sort()
      setCategories(updatedCategories)
      
      // Set as selected category
      setFormData({ ...formData, category: trimmedName })
      
      // Close modal
      setIsAddCategoryModalOpen(false)
      setNewCategoryName('')
      
      Swal.fire({
        icon: 'success',
        title: 'เพิ่มหมวดหมู่สำเร็จ',
        text: `เพิ่มหมวดหมู่ "${trimmedName}" เรียบร้อย`,
        timer: 1500,
        showConfirmButton: false
      })
    } catch (error) {
      console.error('Error adding category:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถเพิ่มหมวดหมู่ได้'
      })
    }
  }

  const handleAddSupplier = async () => {
    if (!newSupplierName || newSupplierName.trim() === '') {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุชื่อซัพพลายเออร์',
        text: 'กรุณากรอกชื่อซัพพลายเออร์'
      })
      return
    }

    const trimmedName = newSupplierName.trim()
    
    // Check if supplier already exists
    if (suppliers.includes(trimmedName)) {
      Swal.fire({
        icon: 'info',
        title: 'ซัพพลายเออร์มีอยู่แล้ว',
        text: `ซัพพลายเออร์ "${trimmedName}" มีอยู่ในระบบแล้ว`
      })
      setNewSupplierName('')
      setIsAddSupplierModalOpen(false)
      setFormData({ ...formData, supplier: trimmedName })
      return
    }

    try {
      // Add to suppliers list
      const updatedSuppliers = [...suppliers, trimmedName].sort()
      setSuppliers(updatedSuppliers)
      
      // Set as selected supplier
      setFormData({ ...formData, supplier: trimmedName })
      
      // Close modal
      setIsAddSupplierModalOpen(false)
      setNewSupplierName('')
      
      Swal.fire({
        icon: 'success',
        title: 'เพิ่มซัพพลายเออร์สำเร็จ',
        text: `เพิ่มซัพพลายเออร์ "${trimmedName}" เรียบร้อย`,
        timer: 1500,
        showConfirmButton: false
      })
    } catch (error) {
      console.error('Error adding supplier:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถเพิ่มซัพพลายเออร์ได้'
      })
    }
  }

  const searchProducts = async (term) => {
    setIsSearching(true)
    try {
      // Fetch all matching products without pagination limit when searching
      const data = await productService.getAllProducts(user, term)
      setProducts(data)
      setCurrentPage(1) // Reset to first page when searching
    } catch (error) {
      console.error('Error searching products:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถค้นหาสินค้าได้'
      })
    } finally {
      setIsSearching(false)
    }
  }

  const handleEditStock = async (product) => {
    const { value: newStock } = await Swal.fire({
      title: `แก้ไขสต็อก: ${product.name}`,
      input: 'number',
      inputValue: product.stock,
      inputAttributes: {
        min: 0,
        step: 1
      },
      showCancelButton: true,
      confirmButtonText: 'บันทึก',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#16a34a',
      inputValidator: (value) => {
        if (value === '' || value === null || value === undefined) {
          return 'กรุณาระบุจำนวนสต็อก'
        }
        if (parseInt(value) < 0) {
          return 'จำนวนสต็อกต้องมากกว่าหรือเท่ากับ 0'
        }
      }
    })

    if (newStock !== undefined && newStock !== null) {
      try {
        Swal.fire({
          title: 'กำลังอัปเดต...',
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading()
        })

        await productService.updateStock(product.id, parseInt(newStock))
        
        Swal.fire({
          icon: 'success',
          title: 'สำเร็จ',
          text: 'สต็อกอัปเดตแล้ว',
          timer: 1500,
          showConfirmButton: false
        })

        // Refresh products
        await fetchProducts()
      } catch (error) {
        console.error('Error updating stock:', error)
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: error.message || 'ไม่สามารถอัปเดตสต็อกได้'
        })
      }
    }
  }

  const handleRestock = async (product) => {
    const { value: qty } = await Swal.fire({
      title: `เติมสต็อก: ${product.name}`,
      text: 'ระบุจำนวนที่ต้องการเติมเพิ่ม (+)',
      input: 'number',
      inputValue: 0,
      inputAttributes: {
        min: 1,
        step: 1
      },
      showCancelButton: true,
      confirmButtonText: 'เติมสต็อก',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#16a34a',
      inputValidator: (value) => {
        if (!value || parseInt(value) <= 0) {
          return 'กรุณาระบุจำนวนที่มากกว่า 0'
        }
      }
    })

    if (qty && parseInt(qty) > 0) {
      try {
        Swal.fire({
          title: 'กำลังเติมสต็อก...',
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading()
        })

        const newStock = product.stock + parseInt(qty)
        await productService.updateStock(product.id, newStock)
        
        Swal.fire({
          icon: 'success',
          title: 'สำเร็จ',
          text: `เติมสต็อก +${qty} เรียบร้อย`,
          timer: 1500,
          showConfirmButton: false
        })

        // Refresh products
        await fetchProducts()
      } catch (error) {
        console.error('Error restocking:', error)
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: error.message || 'ไม่สามารถเติมสต็อกได้'
        })
      }
    }
  }

  const handleAddProduct = () => {
    setFormData(buildEmptyForm())
    setEditingProduct(null)
    setShowAddModal(true)
  }

  const handleImportCsvClick = () => {
    if (isImportingCsv) return
    if (csvInputRef.current) {
      csvInputRef.current.value = ''
      csvInputRef.current.click()
    }
  }

  const handleDownloadCsvTemplate = () => {
    const headers = [
      'productid',
      'name',
      'price',
      'stock',
      'category',
      'supplier',
      'unit',
      'weight',
      'minstock',
      'franchiseprice',
      'cost',
      'orderstep',
      'image',
      'detail',
      'shophidden',
      'visibleregular',
      'visiblefranchise',
      'salerestrictedtousers',
      'allowedvieweremails'
    ]
    const example = [
      'A001',
      'กาแฟคั่วเข้ม 500g',
      '190',
      '120',
      'วัตถุดิบ',
      'Supplier A',
      'ถุง',
      '500',
      '10',
      '175',
      '120',
      '1',
      '',
      'เหมาะสำหรับเมนูเอสเปรสโซ',
      'false',
      'true',
      'true',
      'false',
      ''
    ]
    const csvContent = `${headers.join(',')}\n${example.join(',')}\n`
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'products-import-template.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const downloadCsvErrorReport = (invalidRows) => {
    const headers = ['row_no', 'productid', 'reasons']
    const lines = [headers.join(',')]
    invalidRows.forEach((row) => {
      lines.push([
        toCsvCell(row.rowNo),
        toCsvCell(row.productId),
        toCsvCell((row.reasons || []).join(' | '))
      ].join(','))
    })
    const csvContent = `${lines.join('\n')}\n`
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `products-import-errors-${Date.now()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleCsvImport = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      Swal.fire({ icon: 'warning', title: 'กรุณาเลือกไฟล์ .csv เท่านั้น' })
      return
    }

    setIsImportingCsv(true)
    try {
      const rawText = await file.text()
      const rows = parseCsvText(rawText)
      if (!rows.length) {
        throw new Error('ไฟล์ CSV ไม่มีข้อมูล หรือมีเฉพาะหัวตาราง')
      }

      const seenIdInFile = new Set()
      const invalidRows = []
      const mapped = rows.map((r) => {
        const reasons = []
        const id = String(r.productid || r.id || '').trim()
        const name = String(r.productname || r.name || '').trim()
        const priceRaw = r.price
        const stockRaw = r.stock
        const franchiseRaw = r.franchiseprice
        const weightRaw = r.weight
        const minStockRaw = r.minstock
        const costRaw = r.cost
        const orderStepRaw = r.orderstep
        const price = Number(priceRaw)
        const stock = parseInt(stockRaw || '0', 10)
        const weight = Number(weightRaw || 0)
        const minStock = parseInt(minStockRaw || '5', 10)
        const cost = String(costRaw || '').trim()
        const orderStep = parseInt(orderStepRaw || '1', 10)

        if (!name) reasons.push('name ว่าง')
        if (priceRaw === '' || priceRaw == null) reasons.push('price ว่าง')
        else if (!Number.isFinite(price) || price < 0) reasons.push('price ต้องเป็นตัวเลข >= 0')
        if (stockRaw !== '' && stockRaw != null && (!Number.isFinite(stock) || stock < 0)) reasons.push('stock ต้องเป็นจำนวนเต็ม >= 0')
        if (weightRaw !== '' && weightRaw != null && (!Number.isFinite(weight) || weight < 0)) reasons.push('weight ต้องเป็นตัวเลข >= 0')
        if (minStockRaw !== '' && minStockRaw != null && (!Number.isFinite(minStock) || minStock < 0)) reasons.push('minstock ต้องเป็นจำนวนเต็ม >= 0')
        if (franchiseRaw !== '' && franchiseRaw != null) {
          const franchisePrice = Number(franchiseRaw)
          if (!Number.isFinite(franchisePrice) || franchisePrice < 0) reasons.push('franchiseprice ต้องเป็นตัวเลข >= 0')
        }
        if (cost !== '' && (!Number.isFinite(Number(cost)) || Number(cost) < 0)) reasons.push('cost ต้องเป็นตัวเลข >= 0')
        if (orderStepRaw !== '' && orderStepRaw != null && (!Number.isFinite(orderStep) || orderStep < 1)) reasons.push('orderstep ต้องเป็นจำนวนเต็ม >= 1')
        if (id) {
          const key = id.toLowerCase()
          if (seenIdInFile.has(key)) reasons.push(`productid ซ้ำในไฟล์ (${id})`)
          else seenIdInFile.add(key)
        }

        const visReg = toBool(r.visibleregular, true)
        const visFra = toBool(r.visiblefranchise, true)
        const visibleUserTypes = []
        if (visReg) visibleUserTypes.push('regular')
        if (visFra) visibleUserTypes.push('franchise')
        if (visibleUserTypes.length === 0) reasons.push('ต้องให้เห็นอย่างน้อย 1 กลุ่ม (visibleregular หรือ visiblefranchise)')

        const saleRestrictedToUsers = toBool(r.salerestrictedtousers, false)
        const allowedViewerEmailsText = String(r.allowedvieweremails || '').trim()
        if (saleRestrictedToUsers && !allowedViewerEmailsText) {
          reasons.push('เปิด salerestrictedtousers=true ต้องระบุ allowedvieweremails')
        }

        if (reasons.length > 0) {
          invalidRows.push({
            rowNo: r.__row,
            productId: id || '-',
            reasons
          })
        }

        return {
          id: id || `CSV_${Date.now()}_${r.__row}`,
          name,
          price: Number.isFinite(price) ? price : 0,
          stock: Math.max(0, Number.isFinite(stock) ? stock : 0),
          image: String(r.image || ''),
          category: String(r.category || ''),
          detail: String(r.detail || ''),
          supplier: String(r.supplier || ''),
          unit: String(r.unit || 'ชิ้น'),
          weight: Math.max(0, Number.isFinite(weight) ? weight : 0),
          minStock: Math.max(0, Number.isFinite(minStock) ? minStock : 5),
          cost,
          franchisePrice: franchiseRaw === '' || franchiseRaw == null ? (Number.isFinite(price) ? price : 0) : Number(franchiseRaw),
          orderStep: Math.max(1, Number.isFinite(orderStep) ? orderStep : 1),
          shopHidden: toBool(r.shophidden, false),
          visibleUserTypes: visibleUserTypes.length > 0 ? visibleUserTypes : ['regular', 'franchise'],
          saleRestrictedToUsers,
          allowedViewerEmailsText
        }
      })

      if (invalidRows.length > 0) {
        const detailHtml = invalidRows
          .slice(0, 30)
          .map((x) => `<li>แถว ${x.rowNo} (รหัส: ${escapeHtml(x.productId)}) — ${escapeHtml(x.reasons.join(', '))}</li>`)
          .join('')
        const omitted = invalidRows.length > 30 ? `<p class="text-xs text-gray-500 mt-2">... และอีก ${invalidRows.length - 30} แถว</p>` : ''
        const result = await Swal.fire({
          icon: 'error',
          title: `พบข้อมูลผิด ${invalidRows.length} แถว`,
          html: `<div class="text-left max-h-[45vh] overflow-y-auto"><ul class="list-disc pl-5 space-y-1 text-sm">${detailHtml}</ul>${omitted}</div>`,
          confirmButtonText: 'ดาวน์โหลด Error Report (.csv)',
          showCancelButton: true,
          cancelButtonText: 'ปิด',
          confirmButtonColor: '#0284c7'
        })
        if (result.isConfirmed) {
          downloadCsvErrorReport(invalidRows)
          await Swal.fire({
            icon: 'success',
            title: 'ดาวน์โหลดรายงานแล้ว',
            text: 'นำไฟล์รายงานไปแก้ข้อมูลใน CSV แล้วนำเข้าใหม่ได้ทันที',
            timer: 1800,
            showConfirmButton: false
          })
        }
        return
      }

      const { isConfirmed } = await Swal.fire({
        icon: 'question',
        title: 'ยืนยันการนำเข้า CSV',
        html: `<div class="text-left text-sm">พร้อมเพิ่มสินค้าใหม่ <b>${mapped.length}</b> รายการลงตาราง <b>products</b><br/>ต้องการดำเนินการต่อหรือไม่?</div>`,
        showCancelButton: true,
        confirmButtonText: 'ยืนยันนำเข้า',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#0284c7'
      })
      if (!isConfirmed) return

      Swal.fire({
        title: 'กำลังนำเข้า CSV...',
        text: `กำลังเพิ่มสินค้า ${mapped.length} รายการ`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      })

      const res = await productService.bulkInsertProducts(mapped)
      Swal.fire({
        icon: 'success',
        title: 'นำเข้าสินค้าสำเร็จ',
        text: `เพิ่มสินค้าแล้ว ${res.insertedCount} รายการ`,
        timer: 1800,
        showConfirmButton: false
      })

      await fetchProducts()
      await fetchCategories()
      await fetchSuppliers()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'นำเข้า CSV ไม่สำเร็จ',
        text: error.message || 'ไม่สามารถนำเข้าข้อมูลสินค้าได้'
      })
    } finally {
      setIsImportingCsv(false)
    }
  }

  const handleEditProduct = (product) => {
    const tiersRaw = Array.isArray(product.priceTiers) ? product.priceTiers : []
    const tiers = [...tiersRaw]
      .sort((a, b) => (Number(a?.minQty) || 0) - (Number(b?.minQty) || 0))
      .slice(0, MAX_PRICE_TIERS)
    const primaryId = String(product.bundlePrimaryProductId || '').trim()
    const linkedPrimary =
      product.isBundle === true && primaryId
        ? (products || []).find((p) => String(p?.id || '').trim() === primaryId)
        : null
    const effectiveStock = linkedPrimary ? Number(linkedPrimary.stock || 0) : product.stock
    setFormData({
      id: product.id,
      name: product.name,
      price: product.regularPrice != null ? product.regularPrice : product.price,
      cost: product.cost || '',
      stock: effectiveStock,
      image: product.image || '',
      category: product.category || '',
      detail: product.detail || '',
      supplier: product.supplier || '',
      unit: product.unit || 'ชิ้น',
      weight: product.weight || '',
      minStock: product.minStock || 5,
      franchisePrice: product.franchisePrice || product.price,
      orderStep: String(product.orderStep ?? 1),
      shopHidden: product.shopHidden === true,
      visibleRegular: (product.visibleUserTypes || ['regular', 'franchise']).includes('regular'),
      visibleFranchise: (product.visibleUserTypes || ['regular', 'franchise']).includes('franchise'),
      saleRestrictedToUsers: product.saleRestrictedToUsers === true,
      allowedViewerEmailsText: Array.isArray(product.allowedViewerEmails) ? product.allowedViewerEmails.join('\n') : '',
      productOptionRows: mapProductOptionsToRows(product.productOptions),
      priceTierRows:
        tiers.length > 0
          ? tiers.map((t) => ({
              minQty: String(t.minQty ?? ''),
              price: String(t.price ?? ''),
              franchisePrice:
                t.franchisePrice != null && t.franchisePrice !== '' ? String(t.franchisePrice) : '',
              perMinQtyLot: t.perMinQtyLot === true || t.per_min_qty_lot === true || t.priceIsLotTotal === true
            }))
          : []
    })
    setEditingProduct(product)
    setShowEditModal(true)
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      Swal.fire({
        title: 'กำลังอัปโหลดรูปภาพ...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      const imageUrl = await imageService.uploadImage(file)
      setFormData({ ...formData, image: imageUrl })

      Swal.close()
      Swal.fire({
        icon: 'success',
        title: 'อัปโหลดรูปภาพสำเร็จ',
        timer: 1500,
        showConfirmButton: false
      })
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'อัปโหลดรูปภาพไม่สำเร็จ',
        text: error.message
      })
    }
  }

  const handleSaveProduct = async () => {
    if (!formData.name || !formData.price) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกข้อมูลให้ครบ',
        text: 'ชื่อสินค้าและราคาเป็นข้อมูลที่จำเป็น'
      })
      return
    }

    const allowedEmails = parseAllowedViewerEmailsFromText(formData.allowedViewerEmailsText)
    if (!formData.shopHidden && formData.saleRestrictedToUsers && allowedEmails.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุอีเมลที่อนุญาต',
        text: 'เมื่อเปิดจำกัดเฉพาะอีเมล ต้องมีอีเมลอย่างน้อย 1 รายการ'
      })
      return
    }

    if (!formData.shopHidden && !formData.saleRestrictedToUsers && !formData.visibleRegular && !formData.visibleFranchise) {
      Swal.fire({
        icon: 'warning',
        title: 'เลือกกลุ่มลูกค้า',
        text: 'เมื่อสินค้าเปิดแสดงในร้านและไม่จำกัดอีเมล ต้องเลือกอย่างน้อยหนึ่งกลุ่ม (ลูกค้าทั่วไป หรือ แฟรนไชส์)'
      })
      return
    }

    const visibleUserTypes = []
    if (formData.visibleRegular) visibleUserTypes.push('regular')
    if (formData.visibleFranchise) visibleUserTypes.push('franchise')
    const franchiseAvailable = !formData.shopHidden && formData.visibleFranchise
    const productOptions = (formData.productOptionRows || [])
      .map((row) => ({
        name: String(row.name || '').trim(),
        required: Boolean(row.required),
        values: (Array.isArray(row.values) ? row.values : [])
          .map((v) => ({
            label: String(v?.label || '').trim(),
            price: Number(v?.price ?? 0) || 0
          }))
          .filter((v) => Boolean(v.label))
      }))
      .filter((row) => row.name && row.values.length > 0)

    const orderStepVal = Math.max(1, parseInt(formData.orderStep, 10) || 1)
    const priceTiers = sanitizePriceTiersForDb(buildPriceTiersFromFormRows(formData.priceTierRows))
    for (const t of priceTiers) {
      if (t.minQty % orderStepVal !== 0) {
        Swal.fire({
          icon: 'warning',
          title: 'ราคาขั้นบันไดไม่ตรงกับขั้นตอนการสั่ง',
          text: `เกณฑ์จำนวน ${t.minQty} ควรเป็นทวีคูณของขั้นตอนการสั่ง (${orderStepVal}) เพื่อให้สอดคล้องกับการสั่งซื้อ`
        })
        return
      }
    }

    try {
      Swal.fire({
        title: 'กำลังบันทึก...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      if (editingProduct) {
        const newId = (formData.id || '').trim()
        if (!newId) {
          Swal.close()
          Swal.fire({ icon: 'warning', title: 'กรุณาระบุรหัสสินค้า' })
          return
        }
        await productService.updateProduct(editingProduct.id, {
          id: newId,
          name: formData.name,
          price: Number(formData.price),
          cost: formData.cost ? Number(formData.cost) : undefined,
          stock:
            editingProduct?.isBundle === true && linkedBundlePrimaryStock != null
              ? Math.max(0, Number(linkedBundlePrimaryStock) || 0)
              : Number(formData.stock) || 0,
          image: formData.image,
          category: formData.category,
          detail: formData.detail,
          supplier: formData.supplier,
          unit: formData.unit,
          weight: formData.weight ? Number(formData.weight) : 0,
          minStock: Number(formData.minStock) || 5,
          franchisePrice: formData.franchisePrice ? Number(formData.franchisePrice) : Number(formData.price),
          franchiseAvailable,
          orderStep: Math.max(1, parseInt(formData.orderStep, 10) || 1),
          shopHidden: formData.shopHidden === true,
          visibleUserTypes: formData.shopHidden ? ['regular', 'franchise'] : visibleUserTypes,
          saleRestrictedToUsers: formData.saleRestrictedToUsers === true,
          allowedViewerEmails: serializeAllowedViewerEmailsToJson(allowedEmails),
          productOptions,
          priceTiers
        })

        Swal.fire({
          icon: 'success',
          title: 'อัปเดตสินค้าสำเร็จ',
          timer: 1500,
          showConfirmButton: false
        })
      } else {
        await productService.addProduct({
          ...formData,
          id: formData.id || `PROD_${Date.now()}`,
          shopHidden: formData.shopHidden === true,
          visibleUserTypes: formData.shopHidden ? ['regular', 'franchise'] : visibleUserTypes,
          franchiseAvailable,
          saleRestrictedToUsers: formData.saleRestrictedToUsers === true,
          allowedViewerEmails: serializeAllowedViewerEmailsToJson(allowedEmails),
          productOptions,
          priceTiers
        })

        Swal.fire({
          icon: 'success',
          title: 'เพิ่มสินค้าสำเร็จ',
          timer: 1500,
          showConfirmButton: false
        })
      }

      setShowAddModal(false)
      setShowEditModal(false)
      setEditingProduct(null)
      await fetchProducts()
      await fetchCategories() // Refresh categories list
      await fetchSuppliers() // Refresh suppliers list
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถบันทึกสินค้าได้'
      })
    }
  }

  const handleDeleteProduct = async () => {
    if (!editingProduct) return

    const { isConfirmed } = await Swal.fire({
      title: 'ยืนยันการลบสินค้า',
      html: `
        <div class="text-left">
          <p class="mb-2">ต้องการลบสินค้า <strong>${editingProduct.name}</strong> (${editingProduct.id}) หรือไม่?</p>
          <p class="text-sm text-red-600 font-bold">การลบสินค้าจะไม่สามารถกู้คืนได้</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ลบสินค้า',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280'
    })

    if (!isConfirmed) return

    try {
      Swal.fire({
        title: 'กำลังลบสินค้า...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
      })

      await productService.deleteProduct(editingProduct.id)

      Swal.fire({
        icon: 'success',
        title: 'ลบสินค้าสำเร็จ',
        timer: 1500,
        showConfirmButton: false
      })

      setShowEditModal(false)
      setEditingProduct(null)
      await fetchProducts()
    } catch (error) {
      Swal.close()
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message || 'ไม่สามารถลบสินค้าได้'
      })
    }
  }

  const getEffectiveStock = (product) => {
    if (!product) return 0
    if (product.isBundle !== true) return Number(product.stock || 0)
    const primaryId = String(product.bundlePrimaryProductId || '').trim()
    if (!primaryId) return Number(product.stock || 0)
    const primary = (products || []).find((p) => String(p?.id || '').trim() === primaryId)
    if (!primary) return Number(product.stock || 0)
    return Number(primary.stock || 0)
  }

  const supplierSummaries = useMemo(() => {
    const map = new Map()
    ;(products || []).forEach((p) => {
      const supplierName = getProductSupplierName(p)
      const stock = p.isBundle === true ? getEffectiveStock(p) : Math.max(0, Number(p.stock) || 0)
      const minStock = Number(p.minStock) || 5
      const isLow = stock < 10 || stock < minStock
      if (!map.has(supplierName)) {
        map.set(supplierName, { name: supplierName, productCount: 0, lowStockCount: 0, totalStock: 0 })
      }
      const row = map.get(supplierName)
      row.productCount += 1
      if (isLow) row.lowStockCount += 1
      row.totalStock += stock
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }, [products])

  const supplierCardsFiltered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return supplierSummaries
    return supplierSummaries.filter((s) => s.name.toLowerCase().includes(q))
  }, [supplierSummaries, searchTerm])

  const productsForListing = useMemo(() => {
    let list = products || []
    if (stockViewMode === STOCK_VIEW_BY_SUPPLIER && selectedSupplier) {
      list = list.filter((p) => getProductSupplierName(p) === selectedSupplier)
    }
    const q = searchTerm.trim().toLowerCase()
    if (q && stockViewMode === STOCK_VIEW_BY_SUPPLIER && selectedSupplier) {
      list = list.filter((p) => {
        const name = String(p.name || p.ProductName || '').toLowerCase()
        const id = String(p.id || p.ProductID || '').toLowerCase()
        return name.includes(q) || id.includes(q)
      })
    }
    return list
  }, [products, stockViewMode, selectedSupplier, searchTerm])

  const filteredProducts = useMemo(
    () =>
      [...productsForListing].sort((a, b) => {
        const aVal = sortBy === 'id' ? (a.id || a.ProductID || '') : (a.name || a.ProductName || '')
        const bVal = sortBy === 'id' ? (b.id || b.ProductID || '') : (b.name || b.ProductName || '')
        const aStr = String(aVal).toLowerCase()
        const bStr = String(bVal).toLowerCase()
        const cmp = aStr.localeCompare(bStr, 'th')
        return sortOrder === 'asc' ? cmp : -cmp
      }),
    [productsForListing, sortBy, sortOrder]
  )

  const showProductTable =
    stockViewMode === STOCK_VIEW_ALL || (stockViewMode === STOCK_VIEW_BY_SUPPLIER && selectedSupplier)

  const handleStockViewModeChange = (mode) => {
    setStockViewMode(mode)
    setSelectedSupplier(null)
    setCurrentPage(1)
    if (mode === STOCK_VIEW_BY_SUPPLIER) {
      if (searchTerm.trim()) setSearchTerm('')
      fetchProducts()
    }
  }

  const handleSelectSupplier = (supplierName) => {
    setSelectedSupplier(supplierName)
    setCurrentPage(1)
    setSearchTerm('')
  }

  const handleBackToSuppliers = () => {
    setSelectedSupplier(null)
    setCurrentPage(1)
    setSearchTerm('')
  }

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage)
  const displayedProducts = useMemo(
    () =>
      filteredProducts
        .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
        .map((p) => (p.isBundle === true ? { ...p, stock: getEffectiveStock(p) } : p)),
    [filteredProducts, currentPage, itemsPerPage]
  )

  if (loading && products.length === 0) {
    return <LoadingSpinner />
  }

  return (
    <div className={ADMIN_PAGE_ROOT}>
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />

      <div className={ADMIN_PAGE_BODY}>
        <Sidebar user={user} />

        <div className={ADMIN_MAIN_COLUMN}>
          <div className={ADMIN_MAIN_INNER}>
            <div className={ADMIN_TOOLBAR}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-xl font-bold text-gray-900">จัดการสต็อก</h1>
              <button
                type="button"
                onClick={handleAddProduct}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition shrink-0"
              >
                <Icon icon="fa-plus" />
                <span>เพิ่มสินค้า</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={handleCsvImport}
                />
                <button
                  type="button"
                  onClick={handleDownloadCsvTemplate}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm bg-gray-700 text-white rounded-lg font-bold hover:bg-gray-800 transition"
                  title="ดาวน์โหลดตัวอย่างไฟล์ CSV"
                >
                  <Icon icon="fa-download" />
                  <span className="hidden sm:inline">Template CSV</span>
                  <span className="sm:hidden">CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleImportCsvClick}
                  disabled={isImportingCsv}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm bg-sky-600 text-white rounded-lg font-bold hover:bg-sky-700 transition disabled:opacity-60"
                  title="นำเข้า CSV"
                >
                  <Icon icon={isImportingCsv ? 'fa-spinner' : 'fa-upload'} className={isImportingCsv ? 'animate-spin' : ''} />
                  <span>{isImportingCsv ? 'นำเข้า...' : 'นำเข้า CSV'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/admin/bundle-composer')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition"
                >
                  <Icon icon="fa-boxes" />
                  <span className="hidden md:inline">Bundle</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/admin/stock/qr-codes')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition"
                >
                  <Icon icon="fa-qrcode" />
                  <span className="hidden md:inline">QR สินค้า</span>
                </button>
              </div>
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer hover:text-gray-700">คำแนะนำนำเข้า CSV</summary>
              <p className="mt-1 leading-relaxed">
                หัวตารางอย่างน้อย <span className="font-mono">name,price</span> (แนะนำ <span className="font-mono">productid</span>)
                — รองรับ stock, category, supplier, unit, weight, minstock, franchiseprice, cost, shophidden
              </p>
            </details>
            </div>

            <div className={ADMIN_FILTERS}>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleStockViewModeChange(STOCK_VIEW_ALL)}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition flex items-center gap-1.5 ${
                    stockViewMode === STOCK_VIEW_ALL
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon icon="fa-list" />
                  ทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => handleStockViewModeChange(STOCK_VIEW_BY_SUPPLIER)}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition flex items-center gap-1.5 ${
                    stockViewMode === STOCK_VIEW_BY_SUPPLIER
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon icon="fa-truck" />
                  ตามซัพพลาย
                </button>
                {showProductTable && filteredProducts.length > 0 && (
                  <span className="text-xs text-gray-500 ml-auto">
                    {filteredProducts.length.toLocaleString()} รายการ
                  </span>
                )}
              </div>
              <div className="relative mt-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder={
                    stockViewMode === STOCK_VIEW_BY_SUPPLIER && !selectedSupplier
                      ? 'ค้นหาชื่อซัพพลายเออร์...'
                      : stockViewMode === STOCK_VIEW_BY_SUPPLIER && selectedSupplier
                        ? `ค้นหาสินค้าใน "${selectedSupplier}"...`
                        : 'ค้นหาชื่อสินค้าเพื่อจัดการสต็อก...'
                  }
                  className="w-full pl-10 pr-10 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                />
                <Icon icon="fa-search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                {isSearching && stockViewMode === STOCK_VIEW_ALL && (
                  <Icon icon="fa-spinner" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin text-sm" />
                )}
              </div>
            </div>

            <div className={ADMIN_CONTENT_GROW}>
            {stockViewMode === STOCK_VIEW_BY_SUPPLIER && selectedSupplier && (
              <div className="shrink-0 mb-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={handleBackToSuppliers} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
                  <Icon icon="fa-arrow-left" /> กลับรายการซัพพลาย
                </button>
                <span className="text-sm text-gray-500">/</span>
                <span className="text-sm font-bold text-emerald-800">{selectedSupplier}</span>
                <span className="text-xs text-gray-500 ml-auto">{filteredProducts.length.toLocaleString()} รายการสินค้า</span>
              </div>
            )}

            {stockViewMode === STOCK_VIEW_BY_SUPPLIER && !selectedSupplier && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-3">เลือกซัพพลายเออร์เพื่อดูและจัดการสต็อกสินค้าของซัพนั้น</p>
                {supplierCardsFiltered.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-500">
                    <Icon icon="fa-truck" className="text-4xl text-gray-300 mb-3 block mx-auto" />
                    <p>ไม่พบซัพพลายที่ตรงกับคำค้นหา</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {supplierCardsFiltered.map((sup) => (
                      <button key={sup.name} type="button" onClick={() => handleSelectSupplier(sup.name)} className="group text-left bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-emerald-300 transition">
                        <h3 className="font-bold text-gray-900 line-clamp-2">{sup.name}</h3>
                        <p className="text-sm text-gray-600 mt-2">{sup.productCount.toLocaleString()} สินค้า · สต็อก {Math.round(sup.totalStock).toLocaleString()}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showProductTable && (
            <>
            <div className={ADMIN_TABLE_FRAME}>
              <table className="w-full text-left text-sm text-gray-700">
                <thead className={`${ADMIN_TABLE_HEAD} font-bold uppercase text-xs text-gray-600`}>
                  <tr>
                    <th className="px-2 py-2 w-14">รูป</th>
                    <th className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSortBy('id')
                          setSortOrder((prev) => (sortBy === 'id' ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'))
                        }}
                        className="flex items-center gap-1 hover:text-emerald-600 transition text-left"
                      >
                        รหัสสินค้า
                        {sortBy === 'id' && (sortOrder === 'asc' ? <Icon icon="fa-sort-up" /> : <Icon icon="fa-sort-down" />)}
                        {sortBy !== 'id' && <Icon icon="fa-sort" className="text-gray-300" />}
                      </button>
                    </th>
                    <th className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSortBy('name')
                          setSortOrder((prev) => (sortBy === 'name' ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'))
                        }}
                        className="flex items-center gap-1 hover:text-emerald-600 transition text-left"
                      >
                        ชื่อสินค้า
                        {sortBy === 'name' && (sortOrder === 'asc' ? <Icon icon="fa-sort-up" /> : <Icon icon="fa-sort-down" />)}
                        {sortBy !== 'name' && <Icon icon="fa-sort" className="text-gray-300" />}
                      </button>
                    </th>
                    <th className="px-2 py-2 text-center w-24">คงเหลือ</th>
                    <th className="px-2 py-2 text-right min-w-[11rem]">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isSearching && searchTerm.trim() !== '' && (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-gray-500">
                        <Icon icon="fa-spinner" className="animate-spin text-2xl mb-2 mx-auto" />
                        <p>กำลังค้นหา...</p>
                      </td>
                    </tr>
                  )}
                  {!isSearching && searchTerm.trim() !== '' && displayedProducts.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-gray-500">
                        <Icon icon="fa-search" className="text-2xl mb-2 mx-auto" />
                        <p>ไม่พบสินค้าที่ค้นหา</p>
                      </td>
                    </tr>
                  )}
                  {(!isSearching || searchTerm.trim() === '') && displayedProducts.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-gray-500">
                        <Icon icon="fa-box" className="text-2xl mb-2 mx-auto opacity-50" />
                        <p>ไม่พบสินค้า</p>
                      </td>
                    </tr>
                  )}
                  {(!isSearching || searchTerm.trim() === '') && displayedProducts.map((product) => {
                    const effectiveStock = getEffectiveStock(product)
                    const isBundleRow = product.isBundle === true
                    const bundlePrimaryId = String(product.bundlePrimaryProductId || '').trim()
                    const bundlePrimary = bundlePrimaryId
                      ? (products || []).find((p) => String(p?.id || '').trim() === bundlePrimaryId)
                      : null
                    const bundlePrimaryName = bundlePrimary?.name || bundlePrimaryId || 'สินค้าหลัก'
                    return (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5">
                        {product.image ? (
                          <img 
                            src={product.image} 
                            alt={product.name}
                            className="w-10 h-10 object-cover rounded"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                            <Icon icon="fa-image" className="text-gray-400 text-sm" />
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs text-gray-700">
                        {product.id || product.ProductID || '-'}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-semibold text-sm flex flex-wrap items-center gap-1">
                          {product.name}
                          {product.shopHidden && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900">ปิดรายการ</span>
                          )}
                          {!product.shopHidden &&
                            Array.isArray(product.visibleUserTypes) &&
                            product.visibleUserTypes.length === 1 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900">
                                {product.visibleUserTypes[0] === 'regular'
                                  ? 'เฉพาะลูกค้าทั่วไป'
                                  : 'เฉพาะแฟรนไชส์'}
                              </span>
                            )}
                        </div>
                        <div className="text-[10px] text-gray-400 uppercase mt-1">{product.category}</div>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            effectiveStock < 10
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {effectiveStock} {product.unit || 'ชิ้น'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <div className="flex justify-end flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditProduct(product)}
                            className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-[11px] flex items-center gap-0.5 font-bold"
                            title="แก้ไขสินค้า"
                          >
                            <Icon icon="fa-edit" />
                            <span className="hidden xl:inline">แก้ไข</span>
                          </button>
                          <button
                            onClick={() => {
                              if (isBundleRow) {
                                Swal.fire({
                                  icon: 'info',
                                  title: 'สต๊อกสินค้าชุด',
                                  text: `ไปแก้ที่สินค้าหลัก: ${bundlePrimaryName}`
                                })
                                return
                              }
                              handleEditStock(product)
                            }}
                            className={`px-2 py-1 rounded transition text-[11px] flex items-center gap-0.5 border font-bold ${
                              isBundleRow
                                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-600'
                            }`}
                            title={isBundleRow ? `ไปแก้ที่สินค้าหลัก: ${bundlePrimaryName}` : 'แก้สต๊อก'}
                          >
                            <Icon icon="fa-box" />
                            <span className="hidden xl:inline">สต็อก</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isBundleRow) {
                                Swal.fire({
                                  icon: 'info',
                                  title: 'สต๊อกสินค้าชุด',
                                  text: `ไปแก้ที่สินค้าหลัก: ${bundlePrimaryName}`
                                })
                                return
                              }
                              handleRestock(product)
                            }}
                            className={`px-2 py-1 rounded transition text-[11px] flex items-center gap-0.5 font-bold ${
                              isBundleRow
                                ? 'bg-gray-300 text-white cursor-not-allowed'
                                : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                            title={isBundleRow ? `ไปแก้ที่สินค้าหลัก: ${bundlePrimaryName}` : 'เติมของ'}
                          >
                            <Icon icon="fa-plus" />
                            <span className="hidden xl:inline">เติม</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="shrink-0 mt-2 flex justify-center items-center gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Icon icon="fa-chevron-left" />
                  </button>
                  <span className="text-gray-600 tabular-nums">
                    หน้า {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Icon icon="fa-chevron-right" />
                  </button>
              </div>
            )}
            </>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Product Modal */}
      {(showAddModal || showEditModal) && (
        <div
          className={ADMIN_MODAL_OVERLAY}
          onClick={() => {
            setShowAddModal(false)
            setShowEditModal(false)
            setEditingProduct(null)
          }}
        >
          <div
            className={`${ADMIN_MODAL_PANEL} sm:max-w-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={ADMIN_MODAL_HEADER}>
              <h2 className="text-base font-bold text-gray-900 truncate">
                {editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false)
                  setShowEditModal(false)
                  setEditingProduct(null)
                }}
                className="shrink-0 p-1.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                aria-label="ปิด"
              >
                <Icon icon="fa-times" />
              </button>
            </div>

            <div className={`${ADMIN_MODAL_BODY} space-y-4`}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">รหัสสินค้า</label>
                    <input
                      type="text"
                      value={formData.id}
                      onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                      placeholder={editingProduct ? '' : 'ว่างไว้เพื่อสร้างอัตโนมัติ'}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อสินค้า *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">ราคา *</label>
                    <NumericTextField
                      variant="decimal"
                      required
                      value={formData.price}
                      onChange={(s) => setFormData({ ...formData, price: s })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">ต้นทุน</label>
                    <NumericTextField
                      variant="decimal"
                      value={formData.cost}
                      onChange={(s) => setFormData({ ...formData, cost: s })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">สต็อก</label>
                    <NumericTextField
                      variant="int"
                      value={formData.stock}
                      onChange={(s) => setFormData({ ...formData, stock: s })}
                      disabled={isEditingBundleProduct}
                      className={`w-full border-2 rounded-lg p-3 outline-none ${
                        isEditingBundleProduct
                          ? 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                          : 'border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
                      }`}
                    />
                    {isEditingBundleProduct && (
                      <p className="text-xs text-gray-500 mt-1">
                        สินค้าชุดใช้สต็อกเดียวกับสินค้าหลัก ({linkedBundlePrimaryStock ?? 0} หน่วย)
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">สต็อกขั้นต่ำ</label>
                    <NumericTextField
                      variant="int"
                      value={formData.minStock}
                      onChange={(s) => setFormData({ ...formData, minStock: s })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ขั้นตอนการสั่ง (หน่วย)</label>
                  <p className="text-xs text-gray-500 mb-1">จำนวนขั้นต่ำต่อครั้งที่ลูกค้าสั่งซื้อ (เช่น 1000 = สั่งทีละ 1,000 หน่วย) การเบิก/ตัดสต็อกยังเป็นทีละ 1 หน่วย</p>
                  <NumericTextField
                    variant="int"
                    value={formData.orderStep}
                    onChange={(s) => setFormData({ ...formData, orderStep: s })}
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    placeholder="1"
                  />
                </div>

                <div className="border border-emerald-100 rounded-lg p-3 bg-emerald-50/40 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-sm font-bold text-gray-800">ราคาขั้นบันได (ตามจำนวนในตะกร้า)</label>
                    <button
                      type="button"
                      disabled={(formData.priceTierRows || []).length >= MAX_PRICE_TIERS}
                      onClick={() => {
                        const rows = formData.priceTierRows || []
                        if (rows.length >= MAX_PRICE_TIERS) return
                        setFormData({
                          ...formData,
                          priceTierRows: [...rows, { minQty: '', price: '', franchisePrice: '', perMinQtyLot: false }]
                        })
                      }}
                      className="text-xs font-bold text-emerald-700 px-2 py-1 rounded border border-emerald-300 bg-white hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                    >
                      + เพิ่มขั้น
                    </button>
                  </div>
                  <p className="text-xs text-gray-600">
                    ระบุจำนวนขั้นต่ำ (หน่วยเดียวกับสต็อก) และราคาในแต่ละขั้น — โดยปกติช่องราคา = บาทต่อหนึ่งหน่วย (เช่น ซื้อครบ 2,000 ใบ ใช้ 3.73 บาท/ใบ)
                    ถ้าติ๊ก &quot;ยอดรวม minQty&quot; ช่องราคา = ราคารวมของจำนวนขั้นต่ำนั้นทั้งก้อน (ระบบหาร minQty เป็นราคาต่อหน่วย)
                    เมื่อซื้อถึงหรือเกินจำนวนนั้น ระบบจะใช้ราคานี้แทนราคาหลัก สำหรับชุดยืดหยุ่น จะอิงจากจำนวนสินค้าหลักในชุด — สูงสุด {MAX_PRICE_TIERS} ขั้นต่อสินค้า
                  </p>
                  {(formData.priceTierRows || []).length >= MAX_PRICE_TIERS && (
                    <p className="text-xs text-amber-700 font-medium">ครบจำนวนขั้นสูงสุดแล้ว ({MAX_PRICE_TIERS} ขั้น)</p>
                  )}
                  {(formData.priceTierRows || []).length === 0 ? (
                    <p className="text-xs text-gray-500 italic">ยังไม่มีขั้น — กด &quot;เพิ่มขั้น&quot; หากต้องการ</p>
                  ) : (
                    <div className="space-y-2">
                      {(formData.priceTierRows || []).map((row, idx) => (
                        <div key={`tier-${idx}`} className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-3">
                            <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">จำนวนขั้นต่ำ</label>
                            <NumericTextField
                              variant="int"
                              value={row.minQty}
                              onChange={(s) => {
                                const next = [...(formData.priceTierRows || [])]
                                next[idx] = { ...next[idx], minQty: s }
                                setFormData({ ...formData, priceTierRows: next })
                              }}
                              className="w-full border border-gray-200 rounded-lg p-2 text-sm"
                              placeholder="เช่น 2000"
                            />
                          </div>
                          <div className="col-span-3">
                            <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                              {row.perMinQtyLot ? 'ราคา (บาท รวม minQty)' : 'ราคา (บาท/หน่วย)'}
                            </label>
                            <NumericTextField
                              variant="decimal"
                              value={row.price}
                              onChange={(s) => {
                                const next = [...(formData.priceTierRows || [])]
                                next[idx] = { ...next[idx], price: s }
                                setFormData({ ...formData, priceTierRows: next })
                              }}
                              className="w-full border border-gray-200 rounded-lg p-2 text-sm"
                              placeholder="ราคา"
                            />
                          </div>
                          <div className="col-span-2 flex flex-col justify-end pb-2">
                            <label className="flex items-center gap-1.5 text-[11px] text-gray-700 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={Boolean(row.perMinQtyLot)}
                                onChange={(e) => {
                                  const next = [...(formData.priceTierRows || [])]
                                  next[idx] = { ...next[idx], perMinQtyLot: e.target.checked }
                                  setFormData({ ...formData, priceTierRows: next })
                                }}
                                className="rounded border-gray-300"
                              />
                              ยอดรวม minQty
                            </label>
                          </div>
                          <div className="col-span-3">
                            <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">ราคาแฟรนไชส์ (ถ้ามี)</label>
                            <NumericTextField
                              variant="decimal"
                              value={row.franchisePrice}
                              onChange={(s) => {
                                const next = [...(formData.priceTierRows || [])]
                                next[idx] = { ...next[idx], franchisePrice: s }
                                setFormData({ ...formData, priceTierRows: next })
                              }}
                              className="w-full border border-gray-200 rounded-lg p-2 text-sm"
                              placeholder="ว่าง = ใช้ราคาขั้นนี้"
                            />
                          </div>
                          <div className="col-span-1 flex justify-end pb-1">
                            <button
                              type="button"
                              onClick={() => {
                                const next = (formData.priceTierRows || []).filter((_, i) => i !== idx)
                                setFormData({ ...formData, priceTierRows: next })
                              }}
                              className="text-red-600 text-xs p-1"
                              title="ลบ"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">รูปภาพ</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                  {formData.image && (
                    <img src={formData.image} alt="Preview" className="mt-2 w-32 h-32 object-cover rounded-lg" />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">หมวดหมู่</label>
                    <div className="flex gap-2">
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="flex-1 border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      >
                        <option value="">-- เลือกหมวดหมู่ --</option>
                        {categories.map((category, idx) => (
                          <option key={idx} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setNewCategoryName('')
                          setIsAddCategoryModalOpen(true)
                        }}
                        className="px-4 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition flex items-center gap-2 whitespace-nowrap"
                        title="เพิ่มหมวดหมู่ใหม่"
                      >
                        <Icon icon="fa-plus" />
                        เพิ่ม
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">หน่วย</label>
                    <select
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    >
                      <option value="ชิ้น">ชิ้น</option>
                      <option value="กล่อง">กล่อง</option>
                      <option value="ลัง">ลัง</option>
                      <option value="ถุง">ถุง</option>
                      <option value="ขวด">ขวด</option>
                      <option value="กระป๋อง">กระป๋อง</option>
                      <option value="แพ็ก">แพ็ก</option>
                      <option value="ใบ">ใบ</option>
                      <option value="กรัม">กรัม</option>
                      <option value="กิโลกรัม">กิโลกรัม</option>
                      <option value="ลิตร">ลิตร</option>
                      <option value="มิลลิลิตร">มิลลิลิตร</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">รายละเอียด</label>
                  <textarea
                    value={formData.detail}
                    onChange={(e) => setFormData({ ...formData, detail: e.target.value })}
                    rows={3}
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">ราคาแฟรนไชส์</label>
                    <NumericTextField
                      variant="decimal"
                      value={formData.franchisePrice}
                      onChange={(s) => setFormData({ ...formData, franchisePrice: s })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">น้ำหนัก (กรัม)</label>
                    <NumericTextField
                      variant="int"
                      value={formData.weight}
                      onChange={(s) => setFormData({ ...formData, weight: s })}
                      className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ซัพพลายเออร์</label>
                  <div className="flex gap-2">
                    <select
                      value={formData.supplier}
                      onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                      className="flex-1 border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    >
                      <option value="">-- เลือกซัพพลายเออร์ --</option>
                      {suppliers.map((supplier, idx) => (
                        <option key={idx} value={supplier}>
                          {supplier}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setNewSupplierName('')
                        setIsAddSupplierModalOpen(true)
                      }}
                      className="px-4 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition flex items-center gap-2 whitespace-nowrap"
                      title="เพิ่มซัพพลายเออร์ใหม่"
                    >
                      <Icon icon="fa-plus" />
                      เพิ่ม
                    </button>
                  </div>
                </div>

                <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      id="shop-hidden"
                      type="checkbox"
                      checked={formData.shopHidden}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          shopHidden: e.target.checked
                        })
                      }
                      className="w-4 h-4 text-amber-700 rounded focus:ring-amber-500"
                    />
                    <label htmlFor="shop-hidden" className="text-sm font-bold text-amber-900">
                      ปิดรายการ (ไม่แสดงในร้านหน้าบ้าน — ทั้งลูกค้าทั่วไปและแฟรนไชส์)
                    </label>
                  </div>
                  <p className="text-xs text-amber-800 pl-6">
                    เมื่อเปิดใช้ สินค้าจะไม่แสดงในหน้าเลือกซื้อ แต่ยังแสดงในหน้าจัดการสต็อกของแอดมิน
                  </p>
                  <div className={`pl-6 space-y-2 ${formData.shopHidden ? 'opacity-50 pointer-events-none' : ''}`}>
                    <p className="text-xs font-bold text-gray-700">แสดงสินค้าให้กลุ่ม UserType (เมื่อไม่ปิดรายการ)</p>
                    <label className="flex items-center gap-2 text-sm text-gray-800">
                      <input
                        type="checkbox"
                        checked={formData.saleRestrictedToUsers}
                        onChange={(e) => setFormData({ ...formData, saleRestrictedToUsers: e.target.checked })}
                        className="w-4 h-4 text-emerald-600 rounded"
                      />
                      จำกัดการเห็นเฉพาะอีเมลที่กำหนด
                    </label>
                    {formData.saleRestrictedToUsers && (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          อีเมลที่เห็นสินค้านี้
                        </label>
                        <AllowedViewerEmailPicker
                          value={formData.allowedViewerEmailsText}
                          onChange={(text) =>
                            setFormData({ ...formData, allowedViewerEmailsText: text })
                          }
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm text-gray-800">
                        <input
                          type="checkbox"
                          checked={formData.visibleRegular}
                          onChange={(e) => setFormData({ ...formData, visibleRegular: e.target.checked })}
                          className="w-4 h-4 text-emerald-600 rounded"
                        />
                        ลูกค้าทั่วไป (regular)
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-800">
                        <input
                          type="checkbox"
                          checked={formData.visibleFranchise}
                          onChange={(e) => setFormData({ ...formData, visibleFranchise: e.target.checked })}
                          className="w-4 h-4 text-emerald-600 rounded"
                        />
                        ลูกค้าแฟรนไชส์ (franchise)
                      </label>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 bg-slate-50 rounded-lg p-4 space-y-2">
                  <div className="font-bold text-gray-800">ตัวเลือกสินค้า (ถ้ามี)</div>
                  {(formData.productOptionRows || []).map((row, idx) => (
                    <div key={idx} className="border-b border-slate-200 pb-3 space-y-2">
                      <div className="flex flex-wrap gap-2 items-end">
                        <input
                          className="flex-1 border rounded p-2 text-sm min-w-[120px]"
                          placeholder="ชื่อตัวเลือก"
                          value={row.name}
                          onChange={(e) => {
                            const next = [...(formData.productOptionRows || [])]
                            next[idx] = { ...next[idx], name: e.target.value }
                            setFormData({ ...formData, productOptionRows: next })
                          }}
                        />
                        <label className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            checked={row.required}
                            onChange={(e) => {
                              const next = [...(formData.productOptionRows || [])]
                              next[idx] = { ...next[idx], required: e.target.checked }
                              setFormData({ ...formData, productOptionRows: next })
                            }}
                          />
                          บังคับ
                        </label>
                        <button
                          type="button"
                          className="text-red-600 text-sm font-bold"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              productOptionRows: (formData.productOptionRows || []).filter((_, i) => i !== idx)
                            })
                          }
                        >
                          ลบตัวเลือก
                        </button>
                      </div>
                      {(row.values || []).map((valRow, vIdx) => (
                        <div key={vIdx} className="grid grid-cols-12 gap-2 items-center">
                          <input
                            className="col-span-7 border rounded p-2 text-sm"
                            placeholder="ชื่อตัวเลือกย่อย"
                            value={valRow.label || ''}
                            onChange={(e) => {
                              const next = [...(formData.productOptionRows || [])]
                              const vals = Array.isArray(next[idx].values) ? [...next[idx].values] : []
                              vals[vIdx] = { ...vals[vIdx], label: e.target.value }
                              next[idx] = { ...next[idx], values: vals }
                              setFormData({ ...formData, productOptionRows: next })
                            }}
                          />
                          <NumericTextField
                            variant="decimal"
                            className="col-span-4 border rounded p-2 text-sm"
                            placeholder="ราคาเพิ่ม"
                            value={valRow.price ?? '0'}
                            onFocus={(e) => {
                              if (Number(valRow.price ?? 0) === 0) {
                                e.target.select()
                              }
                            }}
                            onChange={(s) => {
                              const next = [...(formData.productOptionRows || [])]
                              const vals = Array.isArray(next[idx].values) ? [...next[idx].values] : []
                              vals[vIdx] = { ...vals[vIdx], price: s === '' ? '0' : s }
                              next[idx] = { ...next[idx], values: vals }
                              setFormData({ ...formData, productOptionRows: next })
                            }}
                          />
                          <button
                            type="button"
                            className="col-span-1 text-red-600 text-xs font-bold"
                            onClick={() => {
                              const next = [...(formData.productOptionRows || [])]
                              const vals = (Array.isArray(next[idx].values) ? next[idx].values : []).filter((_, i) => i !== vIdx)
                              next[idx] = { ...next[idx], values: vals }
                              setFormData({ ...formData, productOptionRows: next })
                            }}
                          >
                            ลบ
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-xs font-bold text-emerald-800"
                        onClick={() => {
                          const next = [...(formData.productOptionRows || [])]
                          const vals = Array.isArray(next[idx].values) ? [...next[idx].values] : []
                          vals.push({ label: '', price: '0' })
                          next[idx] = { ...next[idx], values: vals }
                          setFormData({ ...formData, productOptionRows: next })
                        }}
                      >
                        + เพิ่มค่าตัวเลือกย่อย
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-sm font-bold text-emerald-800"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        productOptionRows: [
                          ...(formData.productOptionRows || []),
                          { name: '', required: true, values: [{ label: '', price: '0' }] }
                        ]
                      })
                    }
                  >
                    + เพิ่มตัวเลือก
                  </button>

                  {(formData.productOptionRows || []).length > 0 && (
                    <div className="mt-3 border border-emerald-200 bg-emerald-50 rounded-lg p-3 space-y-2">
                      <div className="text-sm font-bold text-emerald-900">พรีวิวตัวเลือก + ราคาเพิ่ม</div>
                      <p className="text-xs text-emerald-800">
                        ตัวอย่างนี้ใช้ค่าแรกของแต่ละตัวเลือกเพื่อให้เห็นผลลัพธ์ก่อนบันทึก
                      </p>
                      {(formData.productOptionRows || [])
                        .filter((row) => String(row?.name || '').trim())
                        .map((row, idx) => {
                          const optionName = String(row.name || '').trim()
                          const values = (Array.isArray(row.values) ? row.values : []).filter((v) => String(v?.label || '').trim())
                          const selected = previewSelectedMap[optionName]
                          return (
                            <div key={`preview-${idx}`} className="bg-white border border-emerald-100 rounded p-2">
                              <div className="text-xs font-bold text-gray-700 mb-1">
                                {optionName} {row.required ? '*' : '(ไม่บังคับ)'}
                              </div>
                              <select className="w-full border rounded px-2 py-1.5 text-xs bg-gray-50" value={selected?.label || ''} readOnly>
                                {values.length === 0 && <option value="">ยังไม่มีค่าตัวเลือก</option>}
                                {values.map((v, i) => {
                                  const label = String(v.label || '').trim()
                                  const price = Number(v.price || 0) || 0
                                  return (
                                    <option key={`${optionName}-${i}`} value={label}>
                                      {label} {price > 0 ? `(+${price.toLocaleString()} บาท)` : '(+0 บาท)'}
                                    </option>
                                  )
                                })}
                              </select>
                            </div>
                          )
                        })}

                      <div className="text-xs text-gray-700 pt-1 border-t border-emerald-200 space-y-1">
                        <div>ราคาสินค้า: {basePricePreview.toLocaleString()} บาท</div>
                        <div>ราคาเพิ่มจากตัวเลือก (ตัวอย่าง): +{previewExtraPrice.toLocaleString()} บาท</div>
                        <div className="font-bold text-emerald-900">
                          ราคาสุทธิที่ลูกค้าเห็น (ตัวอย่าง): {previewFinalPrice.toLocaleString()} บาท
                        </div>
                      </div>
                    </div>
                  )}
                </div>

            </div>

            <div className={`${ADMIN_MODAL_FOOTER} flex-wrap`}>
                  {editingProduct && (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          const id = (formData.id || editingProduct.id || '').trim()
                          if (!id) {
                            Swal.fire({ icon: 'warning', title: 'กรุณาระบุรหัสสินค้าก่อน', timer: 1500, showConfirmButton: false })
                            return
                          }
                          try {
                            const dataUrl = await generateProductQrDataUrl(id)
                            if (dataUrl) {
                              const name = (formData.name || editingProduct.name || id).replace(/[^a-zA-Z0-9\u0E00-\u0E7F\-_]/g, '_')
                              downloadQrImage(dataUrl, `qr-${name}-${id}.png`)
                              Swal.fire({ icon: 'success', title: 'ดาวน์โหลด QR แล้ว', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' })
                            }
                          } catch (e) {
                            Swal.fire({ icon: 'error', title: 'สร้าง QR ไม่สำเร็จ', text: e.message })
                          }
                        }}
                        className="px-4 py-3 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition flex items-center gap-2"
                      >
                        <Icon icon="fa-qrcode" />
                        ดาวน์โหลด QR สินค้า
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteProduct}
                        className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition flex items-center gap-2"
                      >
                        <Icon icon="fa-trash" />
                        ลบสินค้า
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveProduct}
                    className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition sm:min-w-[7rem]"
                  >
                    บันทึก
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false)
                      setShowEditModal(false)
                      setEditingProduct(null)
                    }}
                    className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition sm:min-w-[7rem]"
                  >
                    ยกเลิก
                  </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {isAddCategoryModalOpen && (
        <div className={ADMIN_MODAL_OVERLAY} onClick={() => { setIsAddCategoryModalOpen(false); setNewCategoryName('') }}>
          <div className={`${ADMIN_MODAL_PANEL} sm:max-w-md`} onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">เพิ่มหมวดหมู่ใหม่</h2>
                <button
                  onClick={() => {
                    setIsAddCategoryModalOpen(false)
                    setNewCategoryName('')
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <Icon icon="fa-times" className="text-xl" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อหมวดหมู่ *</label>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddCategory()
                      }
                    }}
                    placeholder="ระบุชื่อหมวดหมู่"
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    autoFocus
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleAddCategory}
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition"
                  >
                    เพิ่มหมวดหมู่
                  </button>
                  <button
                    onClick={() => {
                      setIsAddCategoryModalOpen(false)
                      setNewCategoryName('')
                    }}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-300 transition"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {isAddSupplierModalOpen && (
        <div className={ADMIN_MODAL_OVERLAY} onClick={() => { setIsAddSupplierModalOpen(false); setNewSupplierName('') }}>
          <div className={`${ADMIN_MODAL_PANEL} sm:max-w-md`} onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">เพิ่มซัพพลายเออร์ใหม่</h2>
                <button
                  onClick={() => {
                    setIsAddSupplierModalOpen(false)
                    setNewSupplierName('')
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <Icon icon="fa-times" className="text-xl" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อซัพพลายเออร์ *</label>
                  <input
                    type="text"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddSupplier()
                      }
                    }}
                    placeholder="ระบุชื่อซัพพลายเออร์"
                    className="w-full border-2 border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    autoFocus
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleAddSupplier}
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition"
                  >
                    เพิ่มซัพพลายเออร์
                  </button>
                  <button
                    onClick={() => {
                      setIsAddSupplierModalOpen(false)
                      setNewSupplierName('')
                    }}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-300 transition"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
