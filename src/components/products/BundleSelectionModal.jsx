import { useEffect, useMemo, useState } from 'react'
import Icon from '../common/Icon'
import {
  buildBundleSelectionSummary,
  calculateMaxBundleOrderQty,
  validateFlexibleBundleSelections,
  snapBundleQtyToStep
} from '../../utils/bundleUtils'
import { normalizeSelectedOptions, getSelectedOptionPriceDetails } from '../../utils/productCatalog'
import { parseDigitsToNonNegativeInt, formatNonNegativeIntString } from '../../utils/digitsInput'
import { getPricingShapeForBundlePrimary, getPricingShapeFromProduct, resolveCartUnitPrice } from '../../utils/priceTiers'

export default function BundleSelectionModal({
  open,
  product,
  memberProducts = [],
  user = null,
  onClose,
  onConfirm
}) {
  const [selections, setSelections] = useState({})
  const [orderQty, setOrderQty] = useState(0)
  const [selectedOptions, setSelectedOptions] = useState({})
  const [error, setError] = useState('')

  const productById = useMemo(() => new Map(memberProducts.map((p) => [p.id, p])), [memberProducts])
  const bundleIds = useMemo(
    () => (Array.isArray(product?.bundleLines) ? product.bundleLines.map((l) => String(l?.productId || '').trim()).filter(Boolean) : []),
    [product?.bundleLines]
  )
  const orderStep = Math.max(1, Number(product?.orderStep || 1))
  const primaryId = product?.bundlePrimaryProductId
  const maxFixedQty = useMemo(() => calculateMaxBundleOrderQty(product, productById), [product, productById])

  const userType =
    String(user?.userType || user?.customerType || 'regular').toLowerCase() === 'franchise' ? 'franchise' : 'regular'

  const optionExtraPerUnit = useMemo(() => {
    const details = getSelectedOptionPriceDetails(product?.productOptions, selectedOptions)
    return details.reduce((s, d) => s + (Number(d.extraPrice || 0) || 0), 0)
  }, [product?.productOptions, selectedOptions])

  const previewQty = product?.bundleFlexible ? Number(selections[primaryId] || 0) : Number(orderQty || 0)

  const pricingShapeForPreview = useMemo(() => {
    if (!product) return null
    const primary = primaryId ? productById.get(primaryId) : null
    if (primary) return getPricingShapeForBundlePrimary(product, primary)
    return getPricingShapeFromProduct(product)
  }, [product, productById, primaryId])

  const previewUnitPrice =
    pricingShapeForPreview && previewQty > 0
      ? resolveCartUnitPrice(pricingShapeForPreview, previewQty, userType, optionExtraPerUnit)
      : null
  const previewLineTotal =
    previewUnitPrice != null &&
    Number.isFinite(previewUnitPrice) &&
    previewQty > 0
      ? previewUnitPrice * previewQty
      : null
  const showPricePreview = previewLineTotal != null && Number.isFinite(previewLineTotal)

  useEffect(() => {
    if (!open || !product) return
    if (product.bundleFlexible) {
      const next = {}
      for (const id of bundleIds) next[id] = id === primaryId ? orderStep : 0
      setSelections(next)
      setOrderQty(0)
    } else {
      setSelections({})
      setOrderQty(orderStep)
    }
    const opts = {}
    for (const opt of product.productOptions || []) {
      if (opt.required) opts[opt.name] = ''
    }
    setSelectedOptions(opts)
    setError('')
  }, [open, product, bundleIds, primaryId, orderStep])

  if (!open || !product) return null

  const bumpFlexibleQty = (pid, deltaSteps) => {
    setSelections((prev) => {
      const p = productById.get(pid)
      const step = pid === primaryId ? orderStep : Math.max(1, Number(p?.orderStep || 1))
      const stock = Number(p?.stock || 0)
      let cur = Number(prev[pid] || 0)
      cur = snapBundleQtyToStep(cur, step)
      let next = cur + deltaSteps * step
      next = Math.max(0, next)
      if (stock > 0) {
        const cap = Math.floor(stock / step) * step
        next = Math.min(next, cap)
      }
      return { ...prev, [pid]: next }
    })
  }

  const snapFlexibleQtyOnBlur = (pid) => {
    setSelections((prev) => {
      const p = productById.get(pid)
      const step = pid === primaryId ? orderStep : Math.max(1, Number(p?.orderStep || 1))
      const stock = Number(p?.stock || 0)
      let n = snapBundleQtyToStep(Number(prev[pid] || 0), step)
      if (stock > 0) n = Math.min(n, Math.floor(stock / step) * step)
      return { ...prev, [pid]: n }
    })
  }

  const bumpFixedOrderQty = (deltaSteps) => {
    setOrderQty((prev) => {
      const cur = snapBundleQtyToStep(Number(prev || 0), orderStep)
      let next = cur + deltaSteps * orderStep
      next = Math.max(orderStep, next)
      if (maxFixedQty > 0) next = Math.min(next, maxFixedQty)
      return next
    })
  }

  const confirm = () => {
    setError('')
    const options = normalizeSelectedOptions(selectedOptions)
    for (const opt of product.productOptions || []) {
      if (opt.required && !String(options[opt.name] || '').trim()) {
        setError(`กรุณาเลือกตัวเลือก: ${opt.name}`)
        return
      }
    }

    if (product.bundleFlexible) {
      const check = validateFlexibleBundleSelections({
        bundleProduct: product,
        selections,
        productById
      })
      if (!check.valid) {
        setError(check.errors[0] || 'ข้อมูลชุดไม่ถูกต้อง')
        return
      }
      const primaryQty = Number(selections[primaryId] || 0)
      onConfirm({
        mode: 'flexible',
        primaryQty,
        bundleSelections: selections,
        selectedOptions: options,
        summary: buildBundleSelectionSummary(selections, productById)
      })
      return
    }

    const qty = Math.max(orderStep, Math.round(Number(orderQty || 0) / orderStep) * orderStep)
    if (qty <= 0) {
      setError('จำนวนต้องมากกว่า 0')
      return
    }
    if (qty > maxFixedQty) {
      setError(`จำนวนเกินสต็อกชุด (สูงสุด ${maxFixedQty})`)
      return
    }
    const ratio = qty / orderStep
    const bundleSelections = {}
    for (const line of product.bundleLines || []) {
      const productId = String(line?.productId || '').trim()
      const lineQty = Number(line?.qty || 0)
      if (!productId || lineQty <= 0) continue
      bundleSelections[productId] = lineQty * ratio
    }
    onConfirm({
      mode: 'fixed',
      orderQty: qty,
      bundleSelections,
      selectedOptions: options,
      summary: buildBundleSelectionSummary(bundleSelections, productById)
    })
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-lg font-bold text-gray-900">{product.name}</h3>
          <button type="button" onClick={onClose} className="p-2 rounded hover:bg-gray-100">
            <Icon icon="fa-times" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-4">
          {product.bundleFlexible ? (
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700">เลือกจำนวนส่วนประกอบในชุด</p>
              <p className="text-xs text-gray-600">
                ใช้ปุ่ม − / + หรือพิมพ์จำนวน แล้วคลิกออกจากช่อง — ระบบจะปรับให้หาร step ลงตัวและไม่เกินสต็อก
              </p>
              {(() => {
                const primaryQty = Number(selections[primaryId] || 0)
                let nonPrimarySum = 0
                for (const id of bundleIds) {
                  if (id !== primaryId) nonPrimarySum += Number(selections[id] || 0)
                }
                const sumOk =
                  !product.bundleComponentSumEqualsPrimary ||
                  !primaryId ||
                  nonPrimarySum === primaryQty
                return product.bundleComponentSumEqualsPrimary && primaryId ? (
                  <p
                    className={`text-xs font-medium rounded px-2 py-1.5 ${
                      sumOk ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'
                    }`}
                  >
                    ผลรวมส่วนที่ไม่ใช่หลัก: <b>{nonPrimarySum}</b> — ต้องเท่าจำนวนหลัก <b>{primaryQty}</b>
                  </p>
                ) : null
              })()}
              {showPricePreview && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm">
                  <p className="text-emerald-900">
                    ประเมินราคา (ตามจำนวนหลัก {previewQty.toLocaleString()} {product.unit || 'หน่วย'}):{' '}
                    <span className="font-bold">฿{previewUnitPrice.toLocaleString()}</span> ต่อหน่วย · รวม{' '}
                    <span className="font-bold text-emerald-700">฿{previewLineTotal.toLocaleString()}</span>
                  </p>
                </div>
              )}
              {bundleIds.map((pid) => {
                const p = productById.get(pid)
                const step = pid === primaryId ? orderStep : Math.max(1, Number(p?.orderStep || 1))
                const stock = Number(p?.stock || 0)
                const raw = Number(selections[pid] ?? 0)
                const snapped = snapBundleQtyToStep(raw, step)
                const cap = stock > 0 ? Math.floor(stock / step) * step : null
                const atMin = snapped <= 0
                const atMax = cap != null && snapped >= cap
                const img = p?.image ? String(p.image).trim() : ''
                return (
                  <div key={pid} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
                    {img ? (
                      <img src={img} alt="" className="w-16 h-16 object-cover rounded-lg shrink-0" />
                    ) : (
                      <div className="w-16 h-16 shrink-0 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400">
                        <Icon icon="fa-image" className="text-lg" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-900">
                        {p?.name || pid} {pid === primaryId ? '(หลัก)' : ''}
                      </div>
                      <div className="text-xs text-gray-500">step {step} / stock {stock}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label={`ลด ${step}`}
                        disabled={atMin}
                        onClick={() => bumpFlexibleQty(pid, -1)}
                      >
                        <Icon icon="fa-minus" className="text-xs" />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={`จำนวน ${p?.name || pid}`}
                        className="w-20 h-8 text-center text-sm font-bold border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 px-0.5"
                        value={String(Math.max(0, raw))}
                        onChange={(e) => {
                          const formatted = formatNonNegativeIntString(e.target.value)
                          if (formatted === '') return
                          const n = parseDigitsToNonNegativeInt(formatted)
                          const maxVal = cap != null ? cap : n
                          setSelections((prev) => ({
                            ...prev,
                            [pid]: Math.max(0, Math.min(maxVal, n))
                          }))
                        }}
                        onBlur={() => snapFlexibleQtyOnBlur(pid)}
                      />
                      <button
                        type="button"
                        className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label={`เพิ่ม ${step}`}
                        disabled={atMax}
                        onClick={() => bumpFlexibleQty(pid, 1)}
                      >
                        <Icon icon="fa-plus" className="text-xs" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700">ชุดแบบคงที่</p>
              <div className="text-xs text-gray-500">
                จำนวนสูงสุดที่สั่งได้ตามสต็อกชิ้นส่วน: <b>{maxFixedQty}</b>
              </div>
              <p className="text-xs text-gray-600 mb-1">
                ใช้ปุ่ม − / + หรือพิมพ์จำนวน แล้วคลิกออกจากช่องเพื่อปรับให้หาร {orderStep} ลงตัว
              </p>
              {showPricePreview && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm">
                  <p className="text-emerald-900">
                    ประเมินราคา: <span className="font-bold">฿{previewUnitPrice.toLocaleString()}</span> ต่อหน่วย · รวม{' '}
                    <span className="font-bold text-emerald-700">฿{previewLineTotal.toLocaleString()}</span>
                  </p>
                </div>
              )}
              <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
                {product.image ? (
                  <img
                    src={product.image}
                    alt=""
                    className="w-16 h-16 object-cover rounded-lg shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 shrink-0 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400">
                    <Icon icon="fa-image" className="text-lg" />
                  </div>
                )}
                <div className="flex-1 min-w-0 text-xs text-gray-600">
                  <span className="font-bold text-gray-900 text-sm block mb-1">{product.name}</span>
                  จำนวนต่อ {orderStep} หน่วยของชุด
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`ลด ${orderStep}`}
                    disabled={snapBundleQtyToStep(Number(orderQty || 0), orderStep) <= orderStep}
                    onClick={() => bumpFixedOrderQty(-1)}
                  >
                    <Icon icon="fa-minus" className="text-xs" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label="จำนวนชุด"
                    className="w-20 h-8 text-center text-sm font-bold border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 px-0.5"
                    value={String(Math.max(0, Number(orderQty || 0)))}
                    onChange={(e) => {
                      const formatted = formatNonNegativeIntString(e.target.value)
                      if (formatted === '') return
                      const n = parseDigitsToNonNegativeInt(formatted)
                      const cap = maxFixedQty > 0 ? maxFixedQty : Infinity
                      setOrderQty(Math.max(orderStep, Math.min(cap, n)))
                    }}
                    onBlur={() =>
                      setOrderQty((q) => {
                        const n = snapBundleQtyToStep(Number(q || 0), orderStep)
                        const capped =
                          maxFixedQty > 0 ? Math.min(n, Math.floor(maxFixedQty / orderStep) * orderStep) : n
                        return Math.max(orderStep, capped)
                      })
                    }
                  />
                  <button
                    type="button"
                    className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`เพิ่ม ${orderStep}`}
                    disabled={
                      maxFixedQty > 0 &&
                      snapBundleQtyToStep(Number(orderQty || 0), orderStep) >= maxFixedQty
                    }
                    onClick={() => bumpFixedOrderQty(1)}
                  >
                    <Icon icon="fa-plus" className="text-xs" />
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-xs text-gray-600">
                {(product.bundleLines || []).map((line) => {
                  const pid = String(line?.productId || '').trim()
                  const lq = Number(line?.qty || 0)
                  if (!pid || lq <= 0) return null
                  return (
                    <div key={pid} className="flex justify-between">
                      <span>{productById.get(pid)?.name || pid}</span>
                      <span>x {lq} ต่อ {orderStep} หน่วย</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {Array.isArray(product.productOptions) && product.productOptions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700">ตัวเลือกสินค้า</p>
              {product.productOptions.map((opt) => (
                <div key={opt.name}>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    {opt.name} {opt.required ? '*' : ''}
                  </label>
                  <select
                    value={selectedOptions[opt.name] || ''}
                    onChange={(e) =>
                      setSelectedOptions((prev) => ({ ...prev, [opt.name]: e.target.value }))
                    }
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    <option value="">{opt.required ? 'กรุณาเลือก' : 'ไม่ระบุ'}</option>
                    {(opt.values || []).map((v) => (
                      <option key={`${v.label}-${v.price ?? 0}`} value={v.label}>
                        {v.label}
                        {(Number(v.price || 0) > 0) ? ` (+${Number(v.price || 0).toLocaleString()} บาท)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
        </div>
        <div className="border-t p-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded border text-gray-700 font-bold">
            ยกเลิก
          </button>
          <button type="button" onClick={confirm} className="px-4 py-2 rounded bg-emerald-600 text-white font-bold">
            เพิ่มลงตะกร้า
          </button>
        </div>
      </div>
    </div>
  )
}
