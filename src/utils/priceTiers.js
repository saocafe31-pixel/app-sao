/**
 * ราคาขั้นบันได — ค่าเริ่มต้น: ราคาในขั้น (price) = บาทต่อ 1 หน่วย (เช่น ซื้อครบ 2,000 ใบ ใช้ 3.73 บาท/ใบ)
 *
 * รองรับกรณีกรอกเป็นยอดรวมของจำนวนขั้นต่ำ (lot) โดยใส่ใน JSON ของขั้นนั้น: `"perMinQtyLot": true`
 * แล้ว price = ราคารวมของ minQty หน่วย (ระบบจะหาร minQty ได้ราคาต่อหน่วย)
 *
 * นอกจากนี้มี heuristic ป้องกันข้อมูลผิดรูปแบบที่พบบ่อย: ราคาในขั้นสูงผิดปกติเมื่อเทียบกับราคาหลัก
 * แต่เมื่อหาร minQty แล้วได้ราคาต่อหน่วยที่ต่ำกว่าราคาหลัก — จะถือว่า price เป็นยอดรวมของ minQty หน่วย
 */

/** จำนวนขั้นราคาสูงสุดต่อสินค้า */
export const MAX_PRICE_TIERS = 4

export function parsePriceTiers(raw) {
  if (raw == null || raw === '') return []
  let arr = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .map((row) => {
      const minQty = Math.max(0, Math.floor(Number(row?.minQty ?? row?.min_qty ?? 0) || 0))
      const price = Math.max(0, Number(row?.price ?? 0) || 0)
      let franchisePrice = null
      if (row?.franchisePrice != null && row?.franchisePrice !== '') {
        const fp = Number(row.franchisePrice)
        if (Number.isFinite(fp) && fp >= 0) franchisePrice = fp
      }
      const perMinQtyLot =
        row?.perMinQtyLot === true ||
        row?.per_min_qty_lot === true ||
        row?.priceIsLotTotal === true ||
        row?.price_is_lot_total === true
      return { minQty, price, franchisePrice, perMinQtyLot }
    })
    .filter((row) => row.minQty > 0 && Number.isFinite(row.price))
    .sort((a, b) => a.minQty - b.minQty)
    .slice(0, MAX_PRICE_TIERS)
}

export function sanitizePriceTiersForDb(input) {
  const rows = parsePriceTiers(input)
  return rows.map((row) => {
    const { minQty, price, franchisePrice, perMinQtyLot } = row
    const o = { minQty, price }
    if (franchisePrice != null && Number.isFinite(franchisePrice)) o.franchisePrice = franchisePrice
    if (perMinQtyLot === true) o.perMinQtyLot = true
    return o
  })
}

function readBasePrices(shape) {
  const regularPrice =
    Number(shape?.regularPrice ?? shape?.Price ?? shape?.price ?? 0) || 0
  let franchisePrice = Number(shape?.franchisePrice ?? shape?.FranchisePrice ?? 0) || 0
  if (!Number.isFinite(franchisePrice)) franchisePrice = 0
  return { regularPrice, franchisePrice }
}

/** แปลงค่า price / franchisePrice ในขั้น ให้เป็นราคาต่อ 1 หน่วย (รองรับ lot รวม minQty หน่วย) */
function tierStoredPriceToPerUnit(t, shape, userType) {
  const isFr = String(userType || '').toLowerCase() === 'franchise'
  const minQty = Math.max(1, Number(t.minQty) || 1)
  const rawRegular = Number(t.price)
  const rawFr =
    t.franchisePrice != null && t.franchisePrice !== '' && Number.isFinite(Number(t.franchisePrice))
      ? Number(t.franchisePrice)
      : null
  const raw = isFr && rawFr != null && rawFr >= 0 ? rawFr : rawRegular
  if (!Number.isFinite(raw) || raw < 0) return null

  if (t.perMinQtyLot === true) {
    return raw / minQty
  }

  const { regularPrice, franchisePrice } = readBasePrices(shape)
  const base =
    isFr && franchisePrice > 0 ? franchisePrice : regularPrice
  const divided = raw / minQty

  // กรณีกรอกผิด: ใส่ยอดรวมของ minQty หน่วย ในช่องที่ตั้งใจให้เป็นราคาต่อหน่วย (เช่น 1,000 ใบ รวม 3,810 บาท แต่กรอก 3,810 แทน 3.81)
  const likelyLotTotalMisentered =
    base > 0 &&
    minQty > 1 &&
    raw >= base * 10 &&
    divided > 0 &&
    divided < base

  return likelyLotTotalMisentered ? divided : raw
}

/**
 * ราคาต่อ 1 หน่วย (ก่อนรวมตัวเลือก) หลังใช้ขั้นบันได — หน่วยเดียวกับ regularPrice / Price
 */
export function resolveTieredStepPrice(shape, qty, userType = 'regular') {
  const { regularPrice, franchisePrice } = readBasePrices(shape)
  const q = Number(qty) || 0
  const tiers = parsePriceTiers(shape?.priceTiers ?? shape?.PriceTiers)
  const base =
    String(userType || '').toLowerCase() === 'franchise' && franchisePrice > 0 ? franchisePrice : regularPrice
  if (!tiers.length) return base
  const sorted = [...tiers].sort((a, b) => b.minQty - a.minQty)
  for (const t of sorted) {
    if (q < t.minQty) continue
    const stepPrice = tierStoredPriceToPerUnit(t, shape, userType)
    if (stepPrice != null && Number.isFinite(stepPrice) && stepPrice >= 0) return stepPrice
  }
  return base
}

/**
 * ราคาต่อ 1 หน่วย (สำหรับคูณกับ qty ในตะกร้า) + ส่วนเพิ่มจากตัวเลือกต่อหน่วย
 */
export function resolveCartUnitPrice(shape, qty, userType = 'regular', optionExtraPerUnit = 0) {
  const unitPrice = resolveTieredStepPrice(shape, qty, userType)
  const opt = Number(optionExtraPerUnit) || 0
  return unitPrice + opt
}

export function getPricingShapeFromProduct(product) {
  if (!product) return null
  if (product.tierBasis && typeof product.tierBasis === 'object') {
    const tb = product.tierBasis
    return {
      regularPrice: tb.regularPrice,
      franchisePrice: tb.franchisePrice,
      orderStep: Math.max(1, Number(tb.orderStep ?? 1) || 1),
      priceTiers: tb.priceTiers
    }
  }
  return {
    regularPrice: product.regularPrice,
    franchisePrice: product.franchisePrice,
    orderStep: Math.max(1, Number(product.orderStep ?? 1) || 1),
    priceTiers: product.priceTiers
  }
}

/**
 * สินค้าชุด: ราคาต้องอิงสินค้าแกนหลักเสมอ (ราคาหลัก + ขั้นบันได)
 * ถ้าไม่ส่ง tierBasis เมื่อสมาชิกหลักไม่มี priceTiers ระบบจะไปใช้ราคาสินค้าชุดแม่ — มักผิด (เช่น แม่ 3,810 แต่แก้ว 3.81/ใบ)
 */
export function getPricingShapeFromBundlePrimary(primary) {
  if (!primary) return null
  const tiersRaw = primary.priceTiers ?? primary.PriceTiers
  const priceTiers = Array.isArray(tiersRaw) ? tiersRaw : parsePriceTiers(tiersRaw)
  return {
    regularPrice: Number(primary.regularPrice ?? primary.Price ?? primary.price ?? 0) || 0,
    franchisePrice: Number(primary.franchisePrice ?? primary.FranchisePrice ?? 0) || 0,
    orderStep: Math.max(1, Number(primary.orderStep ?? primary.OrderStep ?? 1) || 1),
    priceTiers
  }
}

/**
 * ราคาขั้นบันไดของชุด: ถ้าสมาชิกหลักไม่มี PriceTiers แต่สินค้าชุดแม่มี (แอดมินตั้งที่แม่)
 * ให้ใช้ราคาหลัก + ขั้นบันไดจากแม่ แต่ยังใช้ orderStep ของสมาชิกหลักต่อการสั่ง
 */
export function getPricingShapeForBundlePrimary(bundleProduct, primaryMember) {
  const memberShape = getPricingShapeFromBundlePrimary(primaryMember)
  if (!memberShape) return null
  const memberTierCount = parsePriceTiers(memberShape.priceTiers).length
  if (memberTierCount > 0) return memberShape

  const bundleShape = getPricingShapeFromProduct(bundleProduct)
  if (!bundleShape) return memberShape
  const bundleTierCount = parsePriceTiers(bundleShape.priceTiers).length
  const pid = bundleProduct?.bundlePrimaryProductId
  if (
    bundleTierCount > 0 &&
    primaryMember?.id &&
    pid != null &&
    String(pid) === String(primaryMember.id)
  ) {
    return {
      regularPrice: bundleShape.regularPrice,
      franchisePrice: bundleShape.franchisePrice,
      orderStep: memberShape.orderStep,
      priceTiers: bundleShape.priceTiers
    }
  }
  return memberShape
}
