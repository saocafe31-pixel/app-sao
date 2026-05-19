/** Shell หน้าแอดมิน — เลื่อนหน้าแนวตั้งตามปกติ, ตารางเลื่อนแนวนอนเมื่อกว้าง */
export const ADMIN_PAGE_ROOT = 'min-h-screen bg-gray-50'

export const ADMIN_PAGE_BODY = 'flex pt-16'

export const ADMIN_MAIN_COLUMN = 'flex-1 ml-0 md:ml-64 min-w-0'

export const ADMIN_MAIN_INNER =
  'w-full max-w-7xl mx-auto px-4 sm:px-6 py-3 pb-8'

export const ADMIN_TOOLBAR = 'space-y-2 mb-2'

export const ADMIN_FILTERS = 'mb-3'

/** บล็อกเนื้อหาหลัก (ตาราง/การ์ด) — ไม่จำกัดความสูงแนวตั้ง */
export const ADMIN_CONTENT_GROW = 'min-w-0'

export const ADMIN_TABLE_FRAME =
  'rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto'

/** หัวตารางปกติ (ไม่ใช้ sticky บน thead — จะเพี้ยนเมื่อมี overflow-x-auto) */
export const ADMIN_TABLE_HEAD = 'bg-gray-100 border-b border-gray-200'
