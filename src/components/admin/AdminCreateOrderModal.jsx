import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import Icon from '../common/Icon'
import { creditService } from '../../services/creditService'
import { imageService } from '../../services/imageService'
import { orderService } from '../../services/orderService'
import { productService } from '../../services/productService'
import { invalidateByPrefix } from '../../utils/cache'
import { shippingCostForWeightGrams } from '../../utils/shippingRates'
import { supabase } from '../../utils/supabase'

/** เลขออเดอร์: ORD{timestamp}-{randomBase36 8 ตัวพิมพ์ใหญ่} */
export function newOrderId() {
  const ts = Date.now()
  let rand = ''
  while (rand.length < 8) {
    rand += Math.random().toString(36).slice(2)
  }
  return `ORD${ts}-${rand.slice(0, 8).toUpperCase()}`
}

/** ดึงลูกค้าสูงสุด ~80 แถวสำหรับตัวเลือกในโมดัล (เทียบเท่า fetchCustomersForVisibilityPicker) */
async function fetchCustomersForAdminPicker() {
  // ใช้เฉพาะชื่อคอลัมน์ที่มีในตาราง (หลายโปรเจกต์ใช้ PascalCase: Email ไม่มีคอลัมน์ email)
  const q1 = await supabase
    .from('users')
    .select('id, Email, Username, UserType, Role, RegisteredDate')
    .order('RegisteredDate', { ascending: false })
    .limit(80)

  if (!q1.error && q1.data) {
    return (q1.data || []).map(mapUserRow)
  }

  const retry = await supabase
    .from('users')
    .select('id, Email, Username, UserType, Role')
    .limit(80)
  if (retry.error) throw new Error(retry.error.message || 'โหลดรายชื่อลูกค้าไม่สำเร็จ')
  return (retry.data || []).map(mapUserRow)
}

function mapUserRow(u) {
  const email = (u.Email || u.email || '').trim()
  const ut = (u.UserType || u.usertype || 'regular').toString().toLowerCase().trim()
  return {
    email,
    username: (u.Username || u.username || '').trim(),
    userType: ut === 'franchise' ? 'franchise' : 'regular',
    role: (u.Role || u.role || '').toString()
  }
}

/** โหลดโปรไฟล์จาก users — Email ตรงตัวก่อน แล้วค่อย ilike (ไม่สนตัวพิมพ์) */
async function fetchUserProfileByEmail(email) {
  const em = (email || '').trim()
  if (!em || !em.includes('@')) return null

  let row = null
  const { data: exact, error: exactErr } = await supabase.from('users').select('*').eq('Email', em).maybeSingle()
  if (exactErr) {
    console.warn('[AdminCreateOrder] users eq Email:', exactErr.message)
  }
  if (exact) {
    row = exact
  } else {
    const { data: rows, error: ilikeErr } = await supabase
      .from('users')
      .select('*')
      .ilike('Email', em)
      .limit(1)
    if (ilikeErr) {
      console.warn('[AdminCreateOrder] users ilike Email:', ilikeErr.message)
    }
    row = rows?.[0] || null
  }

  if (!row) return null

  return {
    address:
      row.Address ||
      row.address ||
      row['ที่อยู่'] ||
      row['Address Line'] ||
      row.address_line ||
      '',
    phone: row.Phone || row.phone || row.PhoneNumber || row.phonenumber || '',
    subdistrict: row.Subdistrict || row.subdistrict || '',
    district: row.District || row.district || '',
    province: row.Province || row.province || '',
    postalCode: row.PostalCode || row.postalcode || '',
    userType: (row.UserType || row.usertype || 'regular').toString().toLowerCase().trim() === 'franchise'
      ? 'franchise'
      : 'regular'
  }
}

function unitPriceForProduct(p, customerUserType) {
  if (!p) return 0
  const reg = Number(p.regularPrice ?? p.price ?? 0) || 0
  const fr = Number(p.franchisePrice ?? 0) || 0
  if (customerUserType === 'franchise' && fr > 0) return fr
  return reg
}

function filterProductsForPicker(catalog, q, maxNoSearch, maxSearch) {
  const term = (q || '').trim().toLowerCase()
  const max = term ? maxSearch : maxNoSearch
  let list = catalog || []
  if (term) {
    list = list.filter((p) => {
      const name = (p.name || '').toLowerCase()
      const id = (p.id || '').toLowerCase()
      const cat = (p.category || '').toLowerCase()
      const sup = (p.supplier || '').toLowerCase()
      return name.includes(term) || id.includes(term) || cat.includes(term) || sup.includes(term)
    })
  }
  return list.slice(0, max)
}

const defaultLine = () => ({ productId: '', qty: 1, note: '' })

/**
 * โมดัลสร้างออเดอร์จากแอดมิน — รีเซ็ตเมื่อปิด / เปิดใหม่
 */
export default function AdminCreateOrderModal({ open, onClose, adminUser, onCreated }) {
  const [loadError, setLoadError] = useState(null)
  const [loadingData, setLoadingData] = useState(false)
  const [customers, setCustomers] = useState([])
  const [catalog, setCatalog] = useState([])

  const [customerEmail, setCustomerEmail] = useState('')
  const [customerUserType, setCustomerUserType] = useState('regular')
  const [customerSearch, setCustomerSearch] = useState('')

  const [lines, setLines] = useState([defaultLine()])
  const [activeLineIndex, setActiveLineIndex] = useState(0)
  const [productSearch, setProductSearch] = useState('')

  const [address, setAddress] = useState('')
  const [subdistrict, setSubdistrict] = useState('')
  const [district, setDistrict] = useState('')
  const [province, setProvince] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')

  const [shippingMethod, setShippingMethod] = useState('delivery')
  const [shippingCost, setShippingCost] = useState(0)

  const [discountRaw, setDiscountRaw] = useState(0)
  const [orderStatus, setOrderStatus] = useState('รอตรวจสอบ')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [slipFile, setSlipFile] = useState(null)
  const [slipPreview, setSlipPreview] = useState(null)
  const [deductStock, setDeductStock] = useState(true)
  const [adminNote, setAdminNote] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const profileLoadSeq = useRef(0)
  const submitLockRef = useRef(false)

  const catalogById = useMemo(() => {
    const m = new Map()
    ;(catalog || []).forEach((p) => {
      if (p?.id) m.set(p.id, p)
    })
    return m
  }, [catalog])

  const resetAll = useCallback(() => {
    setLoadError(null)
    setLoadingData(false)
    setCustomers([])
    setCatalog([])
    setCustomerEmail('')
    setCustomerUserType('regular')
    setCustomerSearch('')
    setLines([defaultLine()])
    setActiveLineIndex(0)
    setProductSearch('')
    setAddress('')
    setSubdistrict('')
    setDistrict('')
    setProvince('')
    setPostalCode('')
    setRecipientPhone('')
    setShippingMethod('delivery')
    setShippingCost(0)
    setDiscountRaw(0)
    setOrderStatus('รอตรวจสอบ')
    setPaymentMethod('transfer')
    setSlipFile(null)
    setSlipPreview(null)
    setDeductStock(true)
    setAdminNote('')
    setSubmitting(false)
    submitLockRef.current = false
  }, [])

  const handleClose = useCallback(() => {
    resetAll()
    onClose()
  }, [onClose, resetAll])

  // โหลดลูกค้า + แคตตาล็อกเมื่อเปิดโมดัล (รีเซ็ตฟอร์มทุกครั้งที่เปิด)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    resetAll()
    setLoadingData(true)
    setLoadError(null)
    const catalogUser = {
      role: 'admin',
      userType: 'regular',
      email: adminUser?.email || ''
    }
    ;(async () => {
      try {
        const [custRows, products] = await Promise.all([
          fetchCustomersForAdminPicker(),
          productService.getAllProducts(catalogUser, '')
        ])
        if (cancelled) return
        setCustomers(custRows)
        setCatalog(products || [])
      } catch (e) {
        if (!cancelled) {
          console.error(e)
          setLoadError(e.message || 'โหลดข้อมูลไม่สำเร็จ')
        }
      } finally {
        if (!cancelled) setLoadingData(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- โหลดใหม่เฉพาะตอน open เป็น true
  }, [open])

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customers.slice(0, 80)
    return customers
      .filter(
        (c) =>
          (c.email || '').toLowerCase().includes(q) ||
          (c.username || '').toLowerCase().includes(q)
      )
      .slice(0, 80)
  }, [customers, customerSearch])

  const pickerProducts = useMemo(
    () => filterProductsForPicker(catalog, productSearch, 300, 200),
    [catalog, productSearch]
  )

  // ยอดแถว / รวม / น้ำหนัก
  const { subtotal, totalWeightGrams } = useMemo(() => {
    let sub = 0
    let w = 0
    for (const line of lines) {
      if (!line.productId) continue
      const p = catalogById.get(line.productId)
      if (!p) continue
      const qty = Math.max(1, Math.round(Number(line.qty)) || 1)
      const unit = unitPriceForProduct(p, customerUserType)
      sub += unit * qty
      const gw = Number(p.weight || 0) || 0
      w += gw * qty
    }
    return { subtotal: sub, totalWeightGrams: w }
  }, [lines, catalogById, customerUserType])

  const discountAmount = useMemo(() => {
    const d = Math.max(0, Number(discountRaw) || 0)
    return Math.min(d, subtotal)
  }, [discountRaw, subtotal])

  // คำนวณค่าจัดส่ง (จัดส่งเท่านั้น) — ใช้ตาราง shipping_rates เหมือน Checkout
  useEffect(() => {
    if (!open) return
    if (shippingMethod === 'pickup') {
      setShippingCost(0)
      return
    }
    if (totalWeightGrams <= 0) {
      setShippingCost(0)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data: rates, error } = await supabase.from('shipping_rates').select('*')
        if (cancelled) return
        if (error) {
          setShippingCost(Math.ceil(totalWeightGrams / 1000) * 50)
          return
        }
        const { cost, usedTable } = shippingCostForWeightGrams(totalWeightGrams, rates)
        if (!usedTable) {
          setShippingCost(Math.ceil(totalWeightGrams / 1000) * 50)
        } else {
          setShippingCost(Math.max(0, cost))
        }
      } catch {
        if (!cancelled) setShippingCost(Math.ceil(totalWeightGrams / 1000) * 50)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, shippingMethod, totalWeightGrams])

  const grandTotal = useMemo(
    () => Math.max(0, subtotal - discountAmount + (shippingMethod === 'pickup' ? 0 : shippingCost)),
    [subtotal, discountAmount, shippingCost, shippingMethod]
  )

  /** ดึงที่อยู่/เบอร์/ตำบล-อำเภอ-จังหวัด-ไปรษณีย์ จากตาราง users แล้วเติมฟอร์ม */
  const applyCustomerProfileFromDb = useCallback(async (emailStr) => {
    const em = (emailStr || '').trim()
    if (!em || !em.includes('@')) return

    const seq = ++profileLoadSeq.current
    const profile = await fetchUserProfileByEmail(em)
    if (seq !== profileLoadSeq.current) return
    if (!profile) return

    setAddress(profile.address || '')
    setRecipientPhone(profile.phone || '')
    setSubdistrict(profile.subdistrict || '')
    setDistrict(profile.district || '')
    setProvince(profile.province || '')
    setPostalCode(profile.postalCode || '')
    setCustomerUserType(profile.userType)
  }, [])

  // คลิกจากรายชื่อลูกค้า — ต้องโหลดที่อยู่ด้วย (เดิมมีแค่ blur เลยไม่ขึ้น)
  const selectCustomer = (c) => {
    setCustomerEmail(c.email)
    setCustomerUserType(c.userType)
    void applyCustomerProfileFromDb(c.email)
  }

  const onEmailBlur = () => {
    void applyCustomerProfileFromDb(customerEmail)
  }

  const addLine = () => {
    setLines((prev) => {
      const next = [...prev, defaultLine()]
      setActiveLineIndex(next.length - 1)
      return next
    })
  }

  const removeLine = (idx) => {
    setLines((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((_, i) => i !== idx)
      setActiveLineIndex((ai) => {
        if (ai >= next.length) return next.length - 1
        if (idx < ai) return ai - 1
        return ai
      })
      return next
    })
  }

  const setLineQty = (idx, raw) => {
    const n = parseInt(String(raw), 10)
    const qty = Number.isFinite(n) && n >= 1 ? n : 1
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, qty } : l)))
  }

  const setLineNote = (idx, value) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, note: value } : l)))
  }

  const pickProductForActiveLine = (productId) => {
    setLines((prev) =>
      prev.map((l, i) => (i === activeLineIndex ? { ...l, productId } : l))
    )
  }

  const validateStock = () => {
    if (!deductStock) return null
    for (const line of lines) {
      if (!line.productId) continue
      const p = catalogById.get(line.productId)
      if (!p) continue
      const qty = Math.max(1, Math.round(Number(line.qty)) || 1)
      const stock = Number(p.stock || 0) || 0
      if (qty > stock) {
        return `สินค้า "${p.name}" มีสต็อกไม่พอ (คงเหลือ ${stock} ชิ้น ต้องการ ${qty})`
      }
    }
    return null
  }

  const buildOrderItems = () => {
    return lines
      .filter((l) => l.productId)
      .map((l) => {
        const p = catalogById.get(l.productId)
        const qty = Math.max(1, Math.round(Number(l.qty)) || 1)
        const price = unitPriceForProduct(p, customerUserType)
        return {
          id: p.id,
          name: p.name,
          price,
          qty,
          freeQty: 0,
          isFree: false,
          promotionId: null,
          image: p.image || '',
          note: String(l.note || '').trim()
        }
      })
  }

  useEffect(() => {
    if (paymentMethod !== 'transfer') {
      setSlipFile(null)
      setSlipPreview(null)
    }
  }, [paymentMethod])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitLockRef.current) return
    submitLockRef.current = true
    try {
      const email = customerEmail.trim()
      if (!email) {
        Swal.fire({ icon: 'warning', title: 'กรุณาระบุอีเมลลูกค้า' })
        return
      }
      if (shippingMethod === 'delivery' && !address.trim()) {
        Swal.fire({ icon: 'warning', title: 'กรุณากรอกที่อยู่จัดส่ง' })
        return
      }
      const items = buildOrderItems()
      if (items.length === 0) {
        Swal.fire({ icon: 'warning', title: 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ' })
        return
      }
      const stockErr = validateStock()
      if (stockErr) {
        Swal.fire({ icon: 'error', title: 'สต็อกไม่พอ', text: stockErr })
        return
      }

      const ship = shippingMethod === 'pickup' ? 0 : shippingCost
      const total = Math.max(0, subtotal - discountAmount + ship)

      if (total <= 0 && items.length > 0) {
        const ok = await Swal.fire({
          icon: 'question',
          title: 'ยอดรวมไม่เกิน 0',
          text: 'ต้องการสร้างออเดอร์นี้ต่อหรือไม่?',
          showCancelButton: true,
          confirmButtonText: 'สร้างต่อ',
          cancelButtonText: 'ยกเลิก'
        })
        if (!ok.isConfirmed) return
      }

      if (paymentMethod === 'credit' && total > 0) {
        try {
          const cr = await creditService.getUserCredit(email)
          if ((cr.balance || 0) < total) {
            Swal.fire({
              icon: 'error',
              title: 'เครดิตไม่พอ',
              html: `<p>ยอดคงเหลือ ฿${(cr.balance || 0).toLocaleString()}</p><p>ต้องชำระ ฿${total.toLocaleString()}</p>`
            })
            return
          }
        } catch (err) {
          Swal.fire({ icon: 'error', title: 'ตรวจสอบเครดิตไม่สำเร็จ', text: err.message })
          return
        }
      }

      const orderId = newOrderId()
      setSubmitting(true)
      Swal.fire({ title: 'กำลังสร้างออเดอร์...', didOpen: () => Swal.showLoading(), allowOutsideClick: false })

      try {
        const slipURL = paymentMethod === 'transfer' && slipFile
          ? await imageService.uploadOrderSlip(slipFile, orderId, email)
          : null

        await orderService.placeOrder(
          {
            id: orderId,
            user: email,
            items,
            total,
            status: orderStatus,
            address: address.trim(),
            discountCode: null,
            discountAmount,
            promotionDiscount: 0,
            promotions: null,
            shippingCost: ship,
            totalWeight: totalWeightGrams,
            tracking: null,
            slipURL,
            shippingMethod,
            paymentMethod,
            subdistrict: subdistrict.trim() || null,
            district: district.trim() || null,
            province: province.trim() || null,
            postalCode: postalCode.trim() || null,
            recipientPhone: recipientPhone.trim() || null,
            createdByAdmin: true,
            adminDiscountNote: adminNote.trim() || null
          },
          {
            skipStockUpdate: !deductStock,
            skipCouponUsage: true,
            skipPromotionUsage: true
          }
        )

        if (paymentMethod === 'credit' && total > 0) {
          try {
            await creditService.deductCredit(
              email,
              total,
              orderId,
              `ชำระออเดอร์แอดมิน ${orderId}`
            )
          } catch (ce) {
            Swal.close()
            await Swal.fire({
              icon: 'warning',
              title: 'ออเดอร์สร้างแล้ว แต่หักเครดิตไม่สำเร็จ',
              text: ce.message || 'โปรดตรวจสอบและหักเครดิตด้วยตนเอง'
            })
          }
        }

        invalidateByPrefix('products_')
        invalidateByPrefix('orders_')
        window.dispatchEvent(new CustomEvent('orderPlaced', { detail: { orderId } }))

        Swal.close()
        await Swal.fire({
          icon: 'success',
          title: 'สร้างออเดอร์สำเร็จ',
          text: `เลขที่ออเดอร์: ${orderId}`
        })
        onCreated?.()
        handleClose()
      } catch (err) {
        Swal.close()
        Swal.fire({ icon: 'error', title: 'สร้างออเดอร์ไม่สำเร็จ', text: err.message || 'เกิดข้อผิดพลาด' })
      } finally {
        setSubmitting(false)
      }
    }
    finally {
      submitLockRef.current = false
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/50">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-labelledby="admin-create-order-title"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
          <h2 id="admin-create-order-title" className="text-lg font-bold text-gray-900">
            สร้างออเดอร์ (แอดมิน)
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-200 text-gray-600"
            aria-label="ปิด"
          >
            <Icon icon="fa-times" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {loadingData && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-600">
              <Icon icon="fa-spinner" className="animate-spin text-2xl mb-2" />
              <span>กำลังโหลดข้อมูล...</span>
            </div>
          )}

          {!loadingData && loadError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 text-sm">
              {loadError}
            </div>
          )}

          {!loadingData && !loadError && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ลูกค้า */}
              <section className="space-y-2">
                <h3 className="text-sm font-bold text-emerald-800 border-b border-emerald-100 pb-1">ลูกค้า</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">อีเมลลูกค้า *</label>
                    <input
                      required
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      onBlur={onEmailBlur}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm"
                      placeholder="customer@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">ค้นหาชื่อ / อีเมล</label>
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm"
                      placeholder="พิมพ์เพื่อกรองรายชื่อ..."
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">ประเภทลูกค้า: {customerUserType === 'franchise' ? 'แฟรนไชส์' : 'ทั่วไป'}</p>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500">ไม่พบรายชื่อ</div>
                  ) : (
                    filteredCustomers.map((c, i) => (
                      <button
                        key={`${c.email}-${i}`}
                        type="button"
                        onClick={() => selectCustomer(c)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 flex justify-between gap-2"
                      >
                        <span className="font-medium text-gray-900 truncate">{c.email}</span>
                        <span className="text-gray-500 shrink-0">
                          {c.username} · {c.userType === 'franchise' ? 'แฟรนไชส์' : 'ทั่วไป'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </section>

              {/* สินค้า */}
              <section className="space-y-2">
                <h3 className="text-sm font-bold text-emerald-800 border-b border-emerald-100 pb-1">รายการสินค้า</h3>
                <div className="grid lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">ค้นหาสินค้า</label>
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm mb-2"
                      placeholder="ชื่อ, รหัส, หมวด, ซัพพลายเออร์..."
                    />
                    <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg">
                      {pickerProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => pickProductForActiveLine(p.id)}
                          className="w-full text-left px-3 py-2 text-xs border-b border-gray-50 hover:bg-emerald-50 flex justify-between gap-2"
                        >
                          <span className="font-mono text-gray-600 shrink-0">{p.id}</span>
                          <span className="text-gray-900 truncate">{p.name}</span>
                          <span className="text-emerald-700 shrink-0">คงเหลือ {p.stock ?? 0}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-gray-600">แถวที่เลือก: คลิกแถวเพื่อเลือก แล้วคลิกสินค้าจากซ้าย</span>
                      <button
                        type="button"
                        onClick={addLine}
                        className="text-xs font-bold text-emerald-700 hover:underline"
                      >
                        + เพิ่มสินค้า
                      </button>
                    </div>
                    {lines.map((line, idx) => {
                      const p = line.productId ? catalogById.get(line.productId) : null
                      const qty = Math.max(1, Math.round(Number(line.qty)) || 1)
                      const unit = p ? unitPriceForProduct(p, customerUserType) : 0
                      const lineTotal = p ? unit * qty : 0
                      const active = idx === activeLineIndex
                      return (
                        <div
                          key={idx}
                          role="button"
                          tabIndex={0}
                          onClick={() => setActiveLineIndex(idx)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') {
                              ev.preventDefault()
                              setActiveLineIndex(idx)
                            }
                          }}
                          className={`rounded-lg border-2 p-3 cursor-pointer transition ${
                            active ? 'border-emerald-500 bg-emerald-50/40' : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <span className="text-xs font-bold text-gray-500">แถว {idx + 1}</span>
                            {lines.length > 1 && (
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation()
                                  removeLine(idx)
                                }}
                                className="text-red-600 text-xs font-bold"
                              >
                                ลบแถว
                              </button>
                            )}
                          </div>
                          <div className="text-sm text-gray-800 mb-2 min-h-[1.25rem]">
                            {p ? (
                              <>
                                <span className="font-mono text-gray-500 mr-2">{p.id}</span>
                                {p.name}
                              </>
                            ) : (
                              <span className="text-gray-400">ยังไม่เลือกสินค้า</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-600">จำนวน</span>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={qty}
                              onClick={(ev) => ev.stopPropagation()}
                              onChange={(e) => setLineQty(idx, e.target.value)}
                              className="w-20 px-2 py-1 border rounded text-sm"
                            />
                            <span className="text-xs text-gray-600">
                              ฿{unit.toLocaleString()} × {qty} = <b>฿{lineTotal.toLocaleString()}</b>
                            </span>
                          </div>
                          <div className="mt-2">
                            <label className="block text-[11px] font-bold text-gray-500 mb-1">
                              หมายเหตุสินค้า / โน้ตแพ็คสินค้า
                            </label>
                            <input
                              type="text"
                              value={line.note || ''}
                              onClick={(ev) => ev.stopPropagation()}
                              onChange={(e) => setLineNote(idx, e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs"
                              placeholder="เช่น แพ็คแยก, ระวังแตก, หมายเหตุเฉพาะสินค้านี้"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>

              {/* จัดส่ง */}
              <section className="space-y-2">
                <h3 className="text-sm font-bold text-emerald-800 border-b border-emerald-100 pb-1">การจัดส่ง</h3>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="shipm"
                      checked={shippingMethod === 'delivery'}
                      onChange={() => setShippingMethod('delivery')}
                    />
                    <span className="text-sm">จัดส่ง</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="shipm"
                      checked={shippingMethod === 'pickup'}
                      onChange={() => setShippingMethod('pickup')}
                    />
                    <span className="text-sm">รับเอง</span>
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    {shippingMethod === 'delivery' ? 'ที่อยู่จัดส่ง *' : 'ที่อยู่ / ติดต่อ (ไม่บังคับ)'}
                  </label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required={shippingMethod === 'delivery'}
                    rows={2}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <input
                    placeholder="แขวง / ตำบล"
                    value={subdistrict}
                    onChange={(e) => setSubdistrict(e.target.value)}
                    className="px-3 py-2 border rounded text-sm"
                  />
                  <input
                    placeholder="เขต / อำเภอ"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="px-3 py-2 border rounded text-sm"
                  />
                  <input
                    placeholder="จังหวัด"
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="px-3 py-2 border rounded text-sm"
                  />
                  <input
                    placeholder="รหัสไปรษณีย์"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="px-3 py-2 border rounded text-sm"
                  />
                </div>
                <input
                  placeholder="เบอร์ผู้รับ"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-xs font-bold text-gray-600">ค่าจัดส่ง (บาท)</span>
                  <span className="font-mono font-bold text-emerald-800">
                    {shippingMethod === 'pickup' ? 0 : shippingCost.toLocaleString()}
                  </span>
                  {shippingMethod === 'delivery' && (
                    <span className="text-xs text-gray-500">คำนวณจากน้ำหนักและตารางอัตรา</span>
                  )}
                  {shippingMethod === 'pickup' && (
                    <span className="text-xs text-gray-500">รับเอง — ค่าจัดส่ง 0</span>
                  )}
                </div>
              </section>

              {/* ส่วนลด / สถานะ / ชำระ */}
              <section className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">ส่วนลด (บาท)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={discountRaw}
                    onChange={(e) => setDiscountRaw(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 border rounded text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">จะไม่เกินยอดสินค้า (cap ที่ ฿{subtotal.toLocaleString()})</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">สถานะออเดอร์</label>
                  <select
                    value={orderStatus}
                    onChange={(e) => setOrderStatus(e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                  >
                    <option value="รอตรวจสอบ">รอตรวจสอบ</option>
                    <option value="กำลังจัดเตรียม">กำลังจัดเตรียม</option>
                    <option value="จัดส่งแล้ว">จัดส่งแล้ว</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">ชำระเงิน</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                  >
                    <option value="transfer">โอนเงิน</option>
                    <option value="credit">เครดิต (หักทันที)</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer mt-6">
                  <input
                    type="checkbox"
                    checked={deductStock}
                    onChange={(e) => setDeductStock(e.target.checked)}
                  />
                  หักสต็อกสินค้า
                </label>
              </section>

              {paymentMethod === 'transfer' && (
                <section className="space-y-2">
                  <h3 className="text-sm font-bold text-emerald-800 border-b border-emerald-100 pb-1">
                    สลิปโอนเงิน
                  </h3>
                  <div
                    className="border-2 border-dashed border-gray-300 p-4 rounded-lg text-center bg-gray-50 cursor-pointer hover:border-emerald-500 transition-colors"
                    onClick={() => document.getElementById('admin-create-order-slip-input')?.click()}
                  >
                    <input
                      id="admin-create-order-slip-input"
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null
                        setSlipFile(file)
                        if (file) {
                          const reader = new FileReader()
                          reader.onloadend = () => setSlipPreview(reader.result)
                          reader.readAsDataURL(file)
                        } else {
                          setSlipPreview(null)
                        }
                      }}
                    />
                    {slipPreview ? (
                      <div className="relative flex flex-col items-center gap-2">
                        <img
                          src={slipPreview}
                          alt="สลิปโอนเงิน"
                          className="max-h-48 max-w-full object-contain rounded-lg border border-emerald-200 shadow-sm bg-white"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSlipFile(null)
                            setSlipPreview(null)
                            const input = document.getElementById('admin-create-order-slip-input')
                            if (input) input.value = ''
                          }}
                          className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 transition"
                          aria-label="ลบสลิป"
                        >
                          <Icon icon="fa-times" />
                        </button>
                        <span className="text-xs text-gray-500 truncate max-w-xs">{slipFile?.name}</span>
                      </div>
                    ) : (
                      <div className="text-gray-400 flex flex-col items-center gap-2">
                        <Icon icon="fa-cloud-upload-alt" className="text-3xl" />
                        <span className="text-sm font-semibold">แตะที่นี่เพื่อแนบสลิปโอนเงิน</span>
                        <span className="text-xs">ไม่บังคับ ถ้าแนบ ระบบจะบันทึกไว้ในออเดอร์</span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">หมายเหตุแอดมิน</label>
                <input
                  type="text"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                  placeholder="บันทึกใน DiscountInfo / metadata"
                />
              </div>

              {/* สรุปยอด */}
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>ยอดสินค้า</span>
                  <span>฿{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-red-700">
                  <span>ส่วนลด</span>
                  <span>-฿{discountAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>ค่าจัดส่ง</span>
                  <span>฿{(shippingMethod === 'pickup' ? 0 : shippingCost).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>น้ำหนักรวม</span>
                  <span>{totalWeightGrams.toLocaleString()} กรัม</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2 mt-2">
                  <span>รวมท้าย</span>
                  <span className="text-emerald-700">฿{grandTotal.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-bold text-sm hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? 'กำลังส่ง...' : 'สร้างออเดอร์'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
