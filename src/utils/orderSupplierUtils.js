/**
 * แยกซัพพลายเออร์ต่อบรรทัดออเดอร์ — ใช้แสดงในหน้าแอดมิน (ไม่เปลี่ยน flow แพ็ก/ส่ง)
 * นิยาม "ส่วนกลาง": Supplier ว่างหรือ normalize แล้วตรงกับค่าคงที่นี้
 */
import { orderItemNameFirstLine } from './orderLineItemDescription'

export const CENTRAL_SUPPLIER_LABEL = 'ส่วนกลาง'

export function normalizeSupplierName(raw) {
  const s = (raw == null ? '' : String(raw)).trim()
  return s === '' ? CENTRAL_SUPPLIER_LABEL : s
}

export function isCentralSupplier(supplierName) {
  return normalizeSupplierName(supplierName) === CENTRAL_SUPPLIER_LABEL
}

/**
 * สร้าง lookup จากรายการสินค้า (normalizeProduct หรือแถวจาก products)
 * @param {Array<{ id?: string, name?: string, supplier?: string, ProductID?: string, ProductName?: string, Supplier?: string }>} products
 */
export function buildProductSupplierLookups(products) {
  const byId = new Map()
  const byName = new Map()
  ;(products || []).forEach((p) => {
    const id = (p.id || p.ProductID || '').toString().trim()
    const name = (p.name || p.ProductName || '').toString().trim()
    const sup = normalizeSupplierName(p.supplier ?? p.Supplier)
    if (id) byId.set(id, sup)
    if (name) byName.set(name, sup)
  })
  return { byId, byName }
}

export function getItemSupplier(item, lookups) {
  if (!lookups) return CENTRAL_SUPPLIER_LABEL
  const pid = (item.id || item.productId || item.ProductID || '').toString().trim()
  if (pid && lookups.byId.has(pid)) {
    return normalizeSupplierName(lookups.byId.get(pid))
  }
  const rawName = (item.name || item.Name || '').toString().trim()
  const n = rawName
  if (n && lookups.byName.has(n)) {
    return normalizeSupplierName(lookups.byName.get(n))
  }
  const firstLine = orderItemNameFirstLine(rawName)
  if (firstLine && lookups.byName.has(firstLine)) {
    return normalizeSupplierName(lookups.byName.get(firstLine))
  }
  return CENTRAL_SUPPLIER_LABEL
}

/** true เมื่อทุกบรรทัดในออเดอร์เป็นส่วนกลาง */
export function isOrderCentralFulfillment(order, lookups) {
  const items = order?.Items || order?.items
  if (!items || items.length === 0) return true
  return items.every((it) => isCentralSupplier(getItemSupplier(it, lookups)))
}

/**
 * รายการซัพที่แตกต่างจากส่วนกลางในออเดอร์ (เรียงแล้ว)
 * @returns {{ allCentral: boolean, externalSuppliers: string[], lineCount: number }}
 */
export function getOrderExternalSuppliers(order, lookups) {
  const items = order?.Items || order?.items || []
  if (items.length === 0) return { allCentral: true, externalSuppliers: [], lineCount: 0 }
  const set = new Set()
  items.forEach((it) => {
    const s = getItemSupplier(it, lookups)
    if (!isCentralSupplier(s)) set.add(s)
  })
  const externalSuppliers = Array.from(set).sort((a, b) => a.localeCompare(b, 'th'))
  return {
    allCentral: externalSuppliers.length === 0,
    externalSuppliers,
    lineCount: items.length
  }
}

export function uniqueSuppliersFromProducts(products) {
  const set = new Set()
  ;(products || []).forEach((p) => {
    set.add(normalizeSupplierName(p.supplier ?? p.Supplier))
  })
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'))
}
