/**
 * อัตราค่าจัดส่งจากตาราง shipping_rates
 * PostgREST/Supabase มักคืนชื่อคอลัมน์เป็น lowercase — ต้อง normalize ก่อนคำนวณ
 *
 * กฎช่วงน้ำหนัก (ลดข้อผิดพลาดจากข้อมูลทับซ้อน):
 * - แถว Min=0, Max=0 = เฉพาะน้ำหนัก 0 ก. (ราคา 0) — ไม่ใช่ช่วงไม่จำกัด
 * - Max=0 และ Min>0 = ช่วงเปิดด้านบน [Min, ∞)
 * - ช่วงปิด: น้ำหนักอยู่ใน [Min, Max] ทั้งคู่รวมขอบ
 * - ถ้าน้ำหนักตกในหลายแถว (เช่น 1000 ก. ตรงทั้ง 0–1000 และ 1000–2000) ใช้แถวที่ MinWeight สูงสุด (ขั้นหนักกว่า)
 * - ถ้าน้ำหนักเกิน Max ของทุกแถวที่มีขอบบน — ใช้ราคาขั้นบนสุดของตาราง (แถวที่ MinWeight สูงสุด)
 */

export function normalizeShippingRateRow(r) {
  if (!r || typeof r !== 'object') return null
  const MinWeight = Number(r.MinWeight ?? r.minweight ?? r.min_weight ?? 0)
  const MaxWeight = Number(r.MaxWeight ?? r.maxweight ?? r.max_weight ?? 0)
  const Price = Number(r.Price ?? r.price ?? 0)
  return {
    id: r.id,
    MinWeight: Number.isFinite(MinWeight) ? MinWeight : 0,
    MaxWeight: Number.isFinite(MaxWeight) ? MaxWeight : 0,
    Price: Number.isFinite(Price) ? Price : 0
  }
}

/**
 * @param {number} weightGrams
 * @param {Array<object>} rawRates แถวจาก Supabase (คีย์ Pascal หรือ lowercase)
 * @returns {{ cost: number, usedTable: boolean }} usedTable=false ให้ caller ใช้สูตรสำรอง
 */
export function shippingCostForWeightGrams(weightGrams, rawRates) {
  const weight = Math.max(0, Number(weightGrams) || 0)

  /** ไม่มีน้ำหนัก = ไม่คิดค่าขนส่ง (ไม่อ่านช่วงราคาในตาราง) */
  if (weight <= 0) {
    return { cost: 0, usedTable: true }
  }

  const rows = (rawRates || []).map(normalizeShippingRateRow).filter(Boolean)

  const validRates = rows.filter(
    (rate) =>
      rate.MinWeight >= 0 &&
      (rate.MaxWeight === 0 || rate.MaxWeight > rate.MinWeight) &&
      Number.isFinite(rate.Price) &&
      rate.Price >= 0
  )

  if (validRates.length === 0) {
    return { cost: 0, usedTable: false }
  }

  /** น้ำหนักอยู่ในช่วงของแถวนี้หรือไม่ (weight เป็นจำนวนเต็มกรัม ≥ 0) */
  const rateContainsWeight = (w, rate) => {
    if (w < rate.MinWeight) return false
    // เฉพาะ 0 ก. — ไม่ใช่ช่วงไม่จำกัด
    if (rate.MinWeight === 0 && rate.MaxWeight === 0) {
      return w === 0
    }
    // ช่วงเปิดด้านบน: Min > 0 และ Max = 0
    if (rate.MaxWeight === 0) {
      return rate.MinWeight > 0
    }
    return w <= rate.MaxWeight
  }

  const matches = validRates.filter((r) => rateContainsWeight(weight, r))

  if (matches.length > 0) {
    const betterMatch = (a, b) => {
      if (b.MinWeight !== a.MinWeight) {
        return b.MinWeight > a.MinWeight ? b : a
      }
      // MinWeight เท่ากัน: ถ้ามีทั้งช่วงปิดและ Max=0 (เปิดบน) ให้ใช้ช่วงปิดที่ยังครอบ weight ก่อน
      const aClosed = a.MaxWeight > 0 && weight <= a.MaxWeight
      const bClosed = b.MaxWeight > 0 && weight <= b.MaxWeight
      if (aClosed && !bClosed) return a
      if (!aClosed && bClosed) return b
      if (aClosed && bClosed) {
        // ช่วงปิดซ้อน: ใช้เพดาน MaxWeight ต่ำกว่า = ช่วงรัดกว่า (มักตรงตารางทีละพันกรัม)
        if (b.MaxWeight !== a.MaxWeight) return b.MaxWeight < a.MaxWeight ? b : a
      }
      // เปิดบนทั้งคู่หรือเสมอภาค: ราคาสูงกว่าเป็นขั้นที่เข้มกว่า (สำรอง)
      if (b.Price !== a.Price) return b.Price > a.Price ? b : a
      return b.MaxWeight > a.MaxWeight ? b : a
    }
    const best = matches.reduce((a, b) => betterMatch(a, b))
    return { cost: best.Price, usedTable: true }
  }

  /** น้ำหนักเกินช่วงที่มีเพดาน — ใช้ราคาขั้นที่มี MinWeight สูงสุด (ขั้นบนสุดของตาราง) */
  const bounded = validRates.filter((r) => r.MaxWeight > 0)
  const topTier =
    bounded.length > 0
      ? bounded.reduce((a, b) => (b.MinWeight > a.MinWeight ? b : b.MinWeight === a.MinWeight && b.MaxWeight > a.MaxWeight ? b : a))
      : validRates.reduce((a, b) => (b.MinWeight > a.MinWeight ? b : a))

  return { cost: topTier.Price, usedTable: true }
}
