import { productService } from '../../services/productService'
import { getSelectedOptionPriceDetails } from '../../utils/productCatalog'
import { getItemSupplierKey } from '../../utils/cartSupplierUtils'
import { CENTRAL_SUPPLIER_LABEL, isCentralSupplier } from '../../utils/orderSupplierUtils'
import { parseDigitsToNonNegativeInt } from '../../utils/digitsInput'
import Icon from '../common/Icon'
import Swal from 'sweetalert2'

function isBundleCartLine(item) {
  if (!item) return false
  if (item.isBundle) return true
  if (
    item.bundleSelections &&
    typeof item.bundleSelections === 'object' &&
    Object.keys(item.bundleSelections).length > 0
  ) {
    return true
  }
  return false
}

export default function Cart({ cart, onUpdateQuantity, onRemove, onClose, onCheckout, onBundleReconfigure, user }) {
  const getTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.qty), 0)
  }

  const getTotalWeight = () => {
    return cart.reduce((sum, item) => sum + ((item.weight || 0) * item.qty), 0)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex items-end">
      <div className="bg-white w-full max-h-[85vh] rounded-t-2xl shadow-2xl flex flex-col overflow-hidden mb-20">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">ตะกร้าสินค้า</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700"
          >
            <Icon icon="fa-times" className="text-xl" />
          </button>
        </div>

        {/* Cart Items - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 0 }}>
          {cart.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Icon icon="fa-shopping-cart" className="text-5xl mb-4 opacity-50" />
              <p>ตะกร้าว่าง</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.lineId || item.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                {item.image && (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                )}
                <div className="flex-1 min-w-0">
                  {(() => {
                    const optionPriceDetails = getSelectedOptionPriceDetails(item.productOptions, item.selectedOptions)
                    const optionExtraPerUnit = optionPriceDetails.reduce((sum, d) => sum + (Number(d.extraPrice || 0)), 0)
                    const supplierLabel =
                      (item.supplier && String(item.supplier).trim()) || getItemSupplierKey(item)
                    const central = isCentralSupplier(supplierLabel)
                    return (
                      <>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-bold text-gray-900 text-sm">{item.name}</h3>
                    <span
                      className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        central
                          ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
                          : 'bg-amber-100 text-amber-900 ring-1 ring-amber-200'
                      }`}
                      title={supplierLabel === CENTRAL_SUPPLIER_LABEL ? 'สินค้าส่วนกลาง (ไม่ระบุซัพ หรือว่าง)' : `Supplier: ${supplierLabel}`}
                    >
                      {supplierLabel}
                    </span>
                  </div>
                  {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
                    <p className="text-xs text-gray-500 mb-1">
                      {Object.entries(item.selectedOptions).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                    </p>
                  )}
                  {optionPriceDetails.length > 0 && (
                    <div className="mb-1">
                      {optionPriceDetails.map((d) => (
                        <p key={`${d.optionName}-${d.optionValue}`} className="text-[11px] text-emerald-700">
                          + {d.optionName}: {d.optionValue} ({Number(d.extraPrice || 0).toLocaleString()} บาท/หน่วย)
                        </p>
                      ))}
                      <p className="text-[11px] text-emerald-800 font-semibold">
                        รวมราคาเพิ่มตัวเลือก: +{optionExtraPerUnit.toLocaleString()} บาท/หน่วย
                      </p>
                    </div>
                  )}
                  {item.bundleSelectionSummary && (
                    <p className="text-xs text-gray-500 mb-1">{item.bundleSelectionSummary}</p>
                  )}
                  <p className="text-xs text-gray-500 mb-1">
                    ฿{item.price.toLocaleString()} ต่อ {item.unit || 'ชิ้น'}
                  </p>
                  <p className="text-emerald-600 font-bold text-base">
                    ฿{(item.price * item.qty).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    จำนวน: {item.qty} {item.unit || 'ชิ้น'}
                    {item.stock !== undefined && (
                      <span className={`ml-2 ${item.qty > item.stock ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                        (สต็อก: {item.stock} {item.unit || 'ชิ้น'})
                      </span>
                    )}
                  </p>
                      </>
                    )
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const step = Math.max(1, item.orderStep || 1)
                    const bundleLine = isBundleCartLine(item)

                    const promptBundleReconfigure = async () => {
                      if (!onBundleReconfigure) return
                      const { isConfirmed } = await Swal.fire({
                        icon: 'question',
                        title: 'สั่งซื้อสินค้าชุดใหม่?',
                        text: 'คุณต้องการสั่งซื้อสินค้าชุดใหม่ ใช่หรือไม่ — ระบบจะนำคุณไปเลือกรายการในชุดใหม่ทั้งหมด',
                        showCancelButton: true,
                        confirmButtonText: 'ใช่',
                        cancelButtonText: 'ไม่',
                        confirmButtonColor: '#16a34a'
                      })
                      if (!isConfirmed) return
                      await onBundleReconfigure(item)
                    }

                    return (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            if (item.qty <= step) return
                            if (bundleLine) {
                              await promptBundleReconfigure()
                              return
                            }
                            onUpdateQuantity(item.lineId || item.id, item.qty - step)
                          }}
                          className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={item.qty <= step}
                        >
                          <Icon icon="fa-minus" className="text-xs" />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          readOnly={bundleLine}
                          title={
                            bundleLine
                              ? 'สินค้าชุด: กด + หรือ − แล้วยืนยันเพื่อเลือกชุดใหม่ (ไม่สามารถพิมพ์จำนวนโดยตรง)'
                              : undefined
                          }
                          aria-label="จำนวนในตะกร้า"
                          className={`w-14 h-8 text-center font-bold border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                            bundleLine ? 'bg-gray-100 cursor-not-allowed' : ''
                          }`}
                          value={String(item.qty)}
                          onChange={(e) => {
                            if (bundleLine) return
                            const digits = e.target.value.replace(/\D/g, '')
                            if (digits === '') return
                            const raw = parseDigitsToNonNegativeInt(e.target.value)
                            const rounded = Math.round(raw / step) * step
                            const newQty = Math.max(step, rounded)
                            if (item.stock !== undefined && newQty > item.stock) {
                              Swal.fire({
                                icon: 'warning',
                                title: 'เกินสต็อก',
                                text: `สินค้านี้มีสต็อกเพียง ${item.stock} ${item.unit || 'ชิ้น'} เท่านั้น`,
                                confirmButtonText: 'ตกลง'
                              })
                              return
                            }
                            onUpdateQuantity(item.lineId || item.id, newQty)
                          }}
                          onBlur={(e) => {
                            if (bundleLine) return
                            const value = parseDigitsToNonNegativeInt(e.target.value)
                            if (value < step) {
                              onUpdateQuantity(item.lineId || item.id, step)
                              return
                            }
                            const rounded = Math.round(value / step) * step
                            onUpdateQuantity(item.lineId || item.id, rounded < step ? step : rounded)
                          }}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (bundleLine) {
                              await promptBundleReconfigure()
                              return
                            }
                            const nextQty = item.qty + step
                            try {
                              const product = await productService.getProduct(item.productId || item.id)
                              if (!product) {
                                Swal.fire({
                                  icon: 'error',
                                  title: 'ไม่พบสินค้า',
                                  text: 'ไม่สามารถเพิ่มจำนวนได้'
                                })
                                return
                              }
                              const currentStock = product.stock || 0
                              if (nextQty > currentStock) {
                                Swal.fire({
                                  icon: 'warning',
                                  title: 'เกินสต็อก',
                                  text: `สินค้านี้มีสต็อกเพียง ${currentStock} ${item.unit || 'ชิ้น'} เท่านั้น (สั่งได้ทีละ ${step})`,
                                  confirmButtonText: 'ตกลง'
                                })
                                return
                              }
                              onUpdateQuantity(item.lineId || item.id, nextQty)
                            } catch (error) {
                              console.error('Error checking stock:', error)
                              Swal.fire({
                                icon: 'error',
                                title: 'เกิดข้อผิดพลาด',
                                text: 'ไม่สามารถตรวจสอบสต็อกได้'
                              })
                            }
                          }}
                          className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 transition"
                        >
                          <Icon icon="fa-plus" className="text-xs" />
                        </button>
                      </>
                    )
                  })()}
                  <button
                    onClick={() => onRemove(item.lineId || item.id)}
                    className="ml-2 p-2 text-red-500 hover:text-red-700 transition"
                  >
                    <Icon icon="fa-trash" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer - Always show if cart has items */}
        {cart.length > 0 && (
          <div className="border-t-2 border-gray-300 p-4 space-y-3 bg-white flex-shrink-0 shadow-lg">
            <div className="flex justify-between text-gray-600 text-sm">
              <span>รวมน้ำหนัก:</span>
              <span className="font-bold">{getTotalWeight().toLocaleString()} กรัม</span>
            </div>
            <div className="flex justify-between text-xl font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>ยอดรวม:</span>
              <span className="text-emerald-600">฿{getTotal().toLocaleString()}</span>
            </div>
            <button
              onClick={() => {
                console.log('Checkout button clicked', { onCheckout: !!onCheckout, cartLength: cart.length })
                if (onCheckout) {
                  onCheckout()
                } else {
                  console.warn('onCheckout not provided, navigating directly')
                  window.location.href = '/checkout'
                }
              }}
              className="w-full bg-emerald-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-emerald-700 transition active:scale-95 shadow-lg mt-4 flex items-center justify-center gap-2"
              style={{ minHeight: '56px' }}
            >
              <Icon icon="fa-shopping-bag" />
              <span>ชำระเงิน / สั่งซื้อ</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
