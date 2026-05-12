/**
 * แปลงข้อความจากช่องกรอกจำนวนเป็นจำนวนเต็มไม่ติดลบ
 * ตัดอักขระที่ไม่ใช่ตัวเลข แล้ว parse — เลข 0 นำหน้าจะหาย (เช่น "0500" → 500)
 */
export function parseDigitsToNonNegativeInt(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits === '') return 0
  return Math.max(0, parseInt(digits, 10))
}

/**
 * คืนสตริงสำหรับช่องจำนวนเต็ม (ไม่มี 0 นำหน้า) — ว่างได้ขณะพิมพ์
 */
export function formatNonNegativeIntString(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits === '') return ''
  return String(parseInt(digits, 10))
}

/**
 * คืนสตริงสำหรับช่องเงิน/ทศนิยม — ตัด 0 นำหน้าส่วนจำนวนเต็ม (เช่น "0325.5" → "325.5")
 */
export function formatNonNegativeDecimalString(raw) {
  const s0 = String(raw ?? '').replace(/[^\d.]/g, '')
  if (s0 === '') return ''
  const dot = s0.indexOf('.')
  const hasDot = dot !== -1
  const wholeRaw = hasDot ? s0.slice(0, dot) : s0
  const fracRaw = hasDot ? s0.slice(dot + 1).replace(/\./g, '') : ''
  const w = wholeRaw === '' ? '' : String(parseInt(wholeRaw, 10) || 0)
  const trailingDotOnly = hasDot && fracRaw === '' && s0.endsWith('.')
  if (trailingDotOnly) return (w === '' ? '0' : w) + '.'
  if (!hasDot) return w
  return (w === '' ? '0' : w) + '.' + fracRaw
}
