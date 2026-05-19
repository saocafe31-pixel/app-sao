/** Overlay ใต้ Header (z-60) — ใช้กับ modal แอดมินทั่วไป */
export const ADMIN_MODAL_OVERLAY =
  'fixed inset-x-0 top-16 bottom-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-3 sm:p-4'

/** กล่อง modal แบบหัว/เนื้อหาเลื่อน/ท้าย — ต่อด้วย max-w-* ตามหน้า */
export const ADMIN_MODAL_PANEL =
  'bg-white w-full rounded-t-2xl sm:rounded-xl shadow-xl flex flex-col max-h-[calc(100%-0.5rem)] sm:max-h-[min(90vh,calc(100dvh-5.5rem))]'

export const ADMIN_MODAL_HEADER =
  'shrink-0 border-b border-gray-200 px-4 py-3 flex justify-between items-center gap-2'

export const ADMIN_MODAL_BODY = 'flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3'

export const ADMIN_MODAL_FOOTER =
  'shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-3 flex flex-wrap gap-2 justify-end'
