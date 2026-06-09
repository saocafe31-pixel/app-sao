export const THEME_COLOR = '#16a34a' // สีเขียว (green-600)

// Logo URLs จาก Supabase Storage (ใช้ VITE_SUPABASE_URL จาก env เท่านั้น)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const STORAGE_BASE = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public` : ''
export const APP_LOGO_URL = STORAGE_BASE ? `${STORAGE_BASE}/company-assets/Logo%20App%20SAO.jpg` : ''
export const LOGO_URL = STORAGE_BASE ? `${STORAGE_BASE}/company-assets/CHAIJUNLA%20CO.,%20LTD.%20(2).png` : ''

export const SHOP_INFO = {
  name: "บริษัท ไชยจันลา จำกัด (สำนักงานใหญ่)",
  address: "เลขที่ 966 ถนนประชาราษฎร์ 1 แขวงบางซื่อ เขตบางซื่อ กรุงเทพมหานคร 10800",
  phone: "094-038-0836",
  taxId: "0 1055 67121 92 9",
  signature: ""
}

export const SHOP_ADDRESS_TEXT = `บริษัท ไชยจันลา จำกัด (สำนักงานใหญ่) 
966 ถนนประชาราษฎร์1 แขวงบางซื่อ เขตบางซื่อ กรุงเทพ 10800 
โทร. 061-732-1346 
เลขประจำตัวผู้เสียภาษี 0105567121929`

/** TTL cache หลัก (products, orders) – 5 นาที */
export const CACHE_DURATION = 5 * 60 * 1000
/** TTL cache ยอดเครดิต – 1 นาที (invalidate เมื่อมีการเติม/หัก) */
export const CREDIT_CACHE_TTL = 1 * 60 * 1000
