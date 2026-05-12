export function snapBundleQtyToStep(value, step) {
  const s = Math.max(1, Number(step || 1))
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n / s) * s
}

export function validateFlexibleBundleSelections(arg1, arg2, arg3) {
  // รองรับทั้งรูปแบบ object และ positional arguments
  const input = (arg1 && typeof arg1 === 'object' && Object.prototype.hasOwnProperty.call(arg1, 'bundleProduct'))
    ? arg1
    : { bundleProduct: arg1, selections: arg2, productById: arg3 }
  const { bundleProduct, selections, productById } = input
  const errors = []
  if (!bundleProduct?.bundleFlexible) return { valid: true, errors: [] }
  const primaryId = bundleProduct.bundlePrimaryProductId
  if (!primaryId) errors.push('ยังไม่ได้กำหนดสินค้าแกนหลักของชุด')
  const map = selections && typeof selections === 'object' ? selections : {}
  const primaryQty = Number(map[primaryId] || 0)
  const bundleStep = Math.max(1, Number(bundleProduct.orderStep || 1))
  if (primaryQty <= 0) errors.push('จำนวนสินค้าหลักต้องมากกว่า 0')
  if (primaryQty % bundleStep !== 0) {
    errors.push(`สินค้าหลักต้องเป็นจำนวนเท่าของ ${bundleStep}`)
  }
  let nonPrimarySum = 0
  for (const [productId, rawQty] of Object.entries(map)) {
    const qty = Number(rawQty || 0)
    if (qty <= 0) continue
    if (productId !== primaryId) nonPrimarySum += qty
    const p = productById?.get(productId)
    const step = productId === primaryId ? bundleStep : Math.max(1, Number(p?.orderStep || 1))
    if (qty % step !== 0) {
      errors.push(`สินค้า ${productId} ต้องเป็นจำนวนเท่าของ ${step}`)
    }
    if (p && qty > Number(p.stock || 0)) {
      errors.push(`สินค้า ${p.name || productId} สต็อกไม่พอ`)
    }
  }
  if (bundleProduct.bundleComponentSumEqualsPrimary && nonPrimarySum !== primaryQty) {
    errors.push('ผลรวมจำนวนชิ้นส่วนที่ไม่ใช่หลัก ต้องเท่ากับจำนวนสินค้าหลัก')
  }
  const valid = errors.length === 0
  return { valid, errors, ok: valid, message: valid ? 'ผ่านเงื่อนไข' : errors[0] || 'ไม่ผ่านเงื่อนไข' }
}

export function buildBundleSelectionSummary(selections, productById) {
  const map = selections && typeof selections === 'object' ? selections : {}
  return Object.entries(map)
    .filter(([, qty]) => Number(qty || 0) > 0)
    .map(([pid, qty]) => `${productById?.get(pid)?.name || pid} x ${Number(qty || 0)}`)
    .join(', ')
}

export function calculateMaxBundleOrderQty(bundleProduct, productById) {
  if (!bundleProduct?.isBundle || bundleProduct?.bundleFlexible) return Number(bundleProduct?.stock || 0)
  const step = Math.max(1, Number(bundleProduct?.orderStep || 1))
  const lines = Array.isArray(bundleProduct?.bundleLines) ? bundleProduct.bundleLines : []
  const fixedLines = lines
    .map((l) => ({
      productId: String(l?.productId || '').trim(),
      qty: Number(l?.qty || 0)
    }))
    .filter((l) => l.productId && l.qty > 0)
  if (fixedLines.length === 0) return 0
  let maxCycles = Infinity
  for (const line of fixedLines) {
    const p = productById?.get(line.productId)
    const stock = Number(p?.stock || 0)
    const cycles = Math.floor(stock / line.qty)
    maxCycles = Math.min(maxCycles, cycles)
  }
  if (!Number.isFinite(maxCycles) || maxCycles <= 0) return 0
  return maxCycles * step
}
