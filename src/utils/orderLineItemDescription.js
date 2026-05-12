import { normalizeSelectedOptions } from './productCatalog'

/** บรรทัดแรกของชื่อที่เก็บในออเดอร์ (ใช้แมตช์ ProductName / FreeItems / น้ำหนัก) */
export function orderItemNameFirstLine(storedName) {
  const s = String(storedName ?? '').split(/\r?\n/)
  return (s[0] || '').trim()
}

/**
 * จำนวนแถมฟรีจาก DiscountInfo — key เก็บเป็นชื่อแคตตาล็อก (บรรทัดแรก)
 * รองรับออเดอร์เก่าที่ key ตรงกับชื่อเต็มทั้งสตริง
 */
export function freeQtyForLineItem(freeItemsMap, storedItemName) {
  if (!freeItemsMap || !(freeItemsMap instanceof Map)) return 0
  const full = String(storedItemName ?? '').trim()
  const first = orderItemNameFirstLine(full)
  return freeItemsMap.get(first) || freeItemsMap.get(full) || 0
}

/** อ่านข้อมูลชุดแบบ machine-readable จากชื่อที่บันทึกในออเดอร์ */
export function parseBundleSelectionIdsFromItemName(storedName) {
  const text = String(storedName ?? '')
  const m = text.match(/(?:^|\n)BUNDLE_IDS:\s*([^\n]+)/i)
  if (!m || !m[1]) return []
  return m[1]
    .split(',')
    .map((part) => part.trim())
    .map((part) => {
      const mm = part.match(/^(.+?)=(\d+(?:\.\d+)?)$/)
      if (!mm) return null
      const productId = String(mm[1] || '').trim()
      const qty = Number(mm[2] || 0)
      if (!productId || !Number.isFinite(qty) || qty <= 0) return null
      return { productId, qty }
    })
    .filter(Boolean)
}

/**
 * ข้อความที่บันทึกใน Itemname: บรรทัดแรก = ชื่อสินค้า, ถัดไป = ตัวเลือก / รายการในชุด
 */
export function buildOrderLineItemName(item) {
  const base = orderItemNameFirstLine(item?.name ?? '')
  if (!base) return String(item?.name ?? '').trim()

  const lines = [base]
  const opts = normalizeSelectedOptions(item?.selectedOptions)
  const optEntries = Object.entries(opts)
  if (optEntries.length > 0) {
    lines.push(`ตัวเลือก: ${optEntries.map(([k, v]) => `${k}: ${v}`).join(' | ')}`)
  }

  const summary = String(item?.bundleSelectionSummary ?? '').trim()
  if (summary) {
    lines.push(`รายการในชุด: ${summary}`)
  } else if (item?.bundleSelections && typeof item.bundleSelections === 'object') {
    const parts = Object.entries(item.bundleSelections)
      .filter(([, q]) => Number(q || 0) > 0)
      .map(([pid, q]) => `${pid} × ${Number(q || 0)}`)
    if (parts.length) lines.push(`รายการในชุด: ${parts.join(', ')}`)
  }

  // บันทึกเป็น machine-readable เพื่อใช้คำนวณตัด/คืนสต๊อกจากออเดอร์ได้แม่นยำ
  if (item?.bundleSelections && typeof item.bundleSelections === 'object') {
    const idParts = Object.entries(item.bundleSelections)
      .filter(([pid, q]) => String(pid || '').trim() && Number(q || 0) > 0)
      .map(([pid, q]) => `${String(pid).trim()}=${Number(q || 0)}`)
    if (idParts.length) lines.push(`BUNDLE_IDS: ${idParts.join(',')}`)
  }

  return lines.join('\n')
}
