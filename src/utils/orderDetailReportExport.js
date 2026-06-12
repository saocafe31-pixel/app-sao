/**
 * รายงานออเดอร์ละเอียดแบบหลายชีต (Excel)
 * ชีต 1: แถวดิบจากตาราง order ตามช่วงวันที่
 * ชีต 2: สรุปยอดซื้อต่อลูกค้า (เรียงมาก→น้อย)
 * ชีต 3: สรุปจำนวน/ยอดขายต่อสินค้า (เรียงมาก→น้อย)
 * ชีต 4: สรุปรวม (จำนวนชิ้น, ยอดสินค้า, ส่วนลดแยกโค้ด/โปร, ค่าส่ง, ช่องทางชำระ)
 *
 * หมายเหตุโครงสร้างข้อมูล: ตาราง order เก็บ 1 แถวต่อ 1 รายการสินค้า
 * ค่าระดับออเดอร์ (Total, Discount, Shipping Cost, PaymentMethod, DiscountInfo)
 * ถูกบันทึกซ้ำทุกแถวของออเดอร์เดียวกัน — ตอนรวมยอดต้องนับครั้งเดียวต่อ OrderID
 */
import { orderItemNameFirstLine } from './orderLineItemDescription'

const RAW_SHEET_COLUMNS = [
  'OrderID',
  'UserEmail',
  'Username',
  'Itemname',
  'Qty',
  'Price',
  'Total',
  'Status',
  'SlipURL',
  'Address',
  'TrackingNo',
  'Timestamp',
  'Discount',
  'Shipping Cost',
  'Weight',
  'ShippingMethod',
  'PaymentMethod',
  'Notes',
  'DiscountInfo',
  'id',
  'ProductID',
  'Subdistrict',
  'District',
  'Province',
  'PostalCode',
  'RecipientPhone'
]

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function round2(value) {
  return Math.round(num(value) * 100) / 100
}

function paymentMethodLabel(value) {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'credit') return 'เครดิต'
  if (key === 'transfer' || !key) return 'โอนเงิน'
  return String(value || '').trim()
}

export function isCancelledOrderRow(row) {
  const status = String(row?.Status || row?.status || '').trim().toLowerCase()
  return status.includes('ยกเลิก') || status.includes('cancelled')
}

/** แยกส่วนลดโค้ด/โปรจาก DiscountInfo + ยอดส่วนลดรวมของออเดอร์ */
export function parseDiscountBreakdownForReport(discountInfoRaw, orderDiscountTotal) {
  const info = String(discountInfoRaw || '')
  const total = Math.max(0, num(orderDiscountTotal))

  let couponCode = null
  let couponAmount = 0
  const couponMatch = info.match(/Code:\s*([^|()]+?)\s*\(-(\d+(?:\.\d+)?)B?\)/i)
  if (couponMatch) {
    couponCode = couponMatch[1].trim()
    couponAmount = num(couponMatch[2])
  }

  let promotionAmount = 0
  const promotionMatch = info.match(/Promotion:\s*-?(\d+(?:\.\d+)?)B?/i)
  if (promotionMatch) {
    promotionAmount = num(promotionMatch[1])
  } else {
    const labelled = info.match(/(?:^|\|)\s*(?:ส่วนลด|Discount):\s*-?(\d+(?:\.\d+)?)B?/i)
    if (labelled) promotionAmount = num(labelled[1])
  }

  // Discount คอลัมน์ = โค้ด + โปร รวมกัน — ถ้ามีโค้ดแต่ยอดรวมมากกว่า ให้ส่วนต่างเป็นโปร
  if (couponAmount > 0 && promotionAmount === 0 && total > couponAmount) {
    promotionAmount = round2(total - couponAmount)
  }
  // ไม่มีรายละเอียดใน DiscountInfo เลย แต่มียอดส่วนลด → นับเป็นโปร/ส่วนลดไม่ระบุ
  if (couponAmount === 0 && promotionAmount === 0 && total > 0) {
    promotionAmount = total
  }

  const promoIdsMatch = info.match(/PromoIds:\s*([\d,\s]+)/i)
  const promotionIds = promoIdsMatch
    ? promoIdsMatch[1]
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n))
    : []

  return { couponCode, couponAmount, promotionAmount, promotionIds }
}

/** ค่าระดับออเดอร์นับครั้งเดียวต่อ OrderID (แถวแรกที่เจอ) */
function collectOrderLevelRecords(rows) {
  const byOrderId = new Map()
  for (const row of rows) {
    const orderId = String(row?.OrderID || '').trim()
    if (!orderId || byOrderId.has(orderId)) continue
    byOrderId.set(orderId, {
      orderId,
      userEmail: String(row.UserEmail || '').trim(),
      username: String(row.Username || '').trim(),
      total: num(row.Total),
      discount: num(row.Discount),
      shippingCost: num(row['Shipping Cost']),
      paymentMethod: String(row.PaymentMethod || 'transfer').trim().toLowerCase(),
      discountInfo: String(row.DiscountInfo || '')
    })
  }
  return [...byOrderId.values()]
}

export function resolveCustomerNameForReport(rec, customerNameByEmail = new Map()) {
  const emailKey = String(rec.userEmail || rec.UserEmail || rec.User || '').trim().toLowerCase()
  const profileName = String(customerNameByEmail.get(emailKey) || '').trim()
  if (profileName) return profileName

  const snapshotName = String(rec.username || rec.Username || '').trim()
  if (snapshotName && snapshotName.toLowerCase() !== emailKey) return snapshotName
  return ''
}

export function resolveProductSupplierForReport(row, productSupplierById = new Map()) {
  const productId = String(row?.ProductID || row?.productId || row?.productid || '').trim()
  const supplierFromProduct = String(productSupplierById.get(productId.toLowerCase()) || '').trim()
  if (supplierFromProduct) return supplierFromProduct

  const directSupplier = String(row?.Supplier || row?.supplier || '').trim()
  if (directSupplier) return directSupplier

  const supplierMatch = String(row?.DiscountInfo || '').match(/(?:^|\|)\s*Supplier:\s*([^|]+)/i)
  return supplierMatch ? supplierMatch[1].trim() : ''
}

/** ชีต 2: สรุปยอดซื้อต่อลูกค้า เรียงยอดซื้อรวมมาก→น้อย */
export function buildCustomerSummaryRows(rows, customerNameByEmail = new Map()) {
  const orderRecords = collectOrderLevelRecords(rows)
  const byCustomer = new Map()

  for (const rec of orderRecords) {
    const key = rec.userEmail.toLowerCase() || rec.username.toLowerCase() || rec.orderId
    const customerName = resolveCustomerNameForReport(rec, customerNameByEmail)
    if (!byCustomer.has(key)) {
      byCustomer.set(key, {
        userEmail: rec.userEmail,
        username: customerName,
        orderCount: 0,
        itemQty: 0,
        totalSpent: 0
      })
    }
    const c = byCustomer.get(key)
    c.orderCount += 1
    c.totalSpent = round2(c.totalSpent + rec.total)
    if (!c.username && customerName) c.username = customerName
  }

  for (const row of rows) {
    const key =
      String(row.UserEmail || '').trim().toLowerCase() ||
      String(row.Username || '').trim().toLowerCase() ||
      String(row.OrderID || '').trim()
    const c = byCustomer.get(key)
    if (c) c.itemQty += num(row.Qty)
  }

  return [...byCustomer.values()].sort((a, b) => b.totalSpent - a.totalSpent)
}

/** ชีต 3: สรุปต่อสินค้า (ชื่อบรรทัดแรก) เรียงจำนวนขายมาก→น้อย */
export function buildProductSummaryRows(rows) {
  const byProduct = new Map()

  for (const row of rows) {
    const name = orderItemNameFirstLine(String(row.Itemname || '')) || '(ไม่ระบุชื่อสินค้า)'
    if (!byProduct.has(name)) {
      byProduct.set(name, { name, qty: 0, revenue: 0 })
    }
    const p = byProduct.get(name)
    const qty = num(row.Qty)
    p.qty += qty
    p.revenue = round2(p.revenue + qty * num(row.Price))
  }

  return [...byProduct.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
}

/** ชีตยอดรวมตามแต่ละออเดอร์ — ยอดสินค้าใช้ทุกแถว, ค่าระดับออเดอร์นับครั้งเดียวต่อ OrderID */
export function buildOrderSummaryRows(rows, productSupplierById = new Map()) {
  const byOrderId = new Map()

  for (const row of rows) {
    const orderId = String(row?.OrderID || '').trim()
    if (!orderId) continue
    if (!byOrderId.has(orderId)) {
      const timestamp = row?.Timestamp || row?.CreatedAt || row?.created_at || ''
      byOrderId.set(orderId, {
        orderId,
        timestamp,
        summaryDate: toLocalYmd(timestamp),
        userEmail: String(row.UserEmail || row.email || '').trim(),
        suppliers: new Set(),
        paymentMethod: String(row.PaymentMethod || 'transfer').trim().toLowerCase(),
        itemRevenue: 0,
        discount: num(row.Discount),
        shippingCost: num(row['Shipping Cost']),
        orderTotal: num(row.Total),
        calculatedTotal: 0,
        totalDifference: 0
      })
    }
    const rec = byOrderId.get(orderId)
    const supplier = resolveProductSupplierForReport(row, productSupplierById)
    if (supplier) rec.suppliers.add(supplier)
    rec.itemRevenue = round2(rec.itemRevenue + num(row.Qty) * num(row.Price))
  }

  return [...byOrderId.values()].map((rec) => ({
    ...rec,
    calculatedTotal: round2(rec.itemRevenue - rec.discount + rec.shippingCost),
    totalDifference: round2(rec.orderTotal - (rec.itemRevenue - rec.discount + rec.shippingCost)),
    supplier: [...rec.suppliers].sort((a, b) => a.localeCompare(b, 'th')).join(', ')
  }))
}

export function buildProfitLossRows(rows, { productCostById = new Map(), productCostByName = new Map() } = {}) {
  const orderRecords = collectOrderLevelRecords(rows)
  let itemRevenue = 0
  let productCost = 0

  for (const row of rows) {
    const qty = num(row.Qty)
    itemRevenue = round2(itemRevenue + qty * num(row.Price))
    const productId = String(row?.ProductID || row?.productId || row?.productid || '').trim().toLowerCase()
    const itemName = String(row?.Itemname || row?.ItemName || row?.itemname || '').trim()
    const firstLineName = orderItemNameFirstLine(itemName)
    const unitCost =
      productCostById.get(productId) ??
      productCostByName.get(firstLineName) ??
      productCostByName.get(itemName) ??
      0
    productCost = round2(productCost + qty * num(unitCost))
  }

  let discountTotal = 0
  let shippingTotal = 0
  let recordedOrderTotal = 0
  for (const rec of orderRecords) {
    discountTotal = round2(discountTotal + rec.discount)
    shippingTotal = round2(shippingTotal + rec.shippingCost)
    recordedOrderTotal = round2(recordedOrderTotal + rec.total)
  }

  const calculatedOrderTotal = round2(itemRevenue - discountTotal + shippingTotal)
  const orderTotalDifference = round2(recordedOrderTotal - calculatedOrderTotal)
  const grossProfitBeforeShipping = round2(itemRevenue - discountTotal - productCost)
  const netProfit = round2(calculatedOrderTotal - productCost - shippingTotal)
  const netProfitMargin = calculatedOrderTotal > 0 ? round2((netProfit / calculatedOrderTotal) * 100) : 0

  return [
    { label: 'รายได้จากสินค้า (บาท)', amount: itemRevenue },
    { label: 'หัก ส่วนลด/โปรโมชั่น (บาท)', amount: discountTotal },
    { label: 'บวก ค่าจัดส่งรวม (บาท)', amount: shippingTotal },
    { label: 'ยอดขายสุทธิจากสูตร (บาท)', amount: calculatedOrderTotal },
    { label: 'ยอดขายรวมที่บันทึกในออเดอร์ (บาท)', amount: recordedOrderTotal },
    { label: 'ผลต่างยอดบันทึกกับสูตร (บาท)', amount: orderTotalDifference },
    { label: 'หัก ต้นทุนสินค้า (บาท)', amount: productCost },
    { label: 'กำไรขั้นต้นก่อนค่าจัดส่ง (บาท)', amount: grossProfitBeforeShipping },
    { label: 'กำไรสุทธิ (บาท)', amount: netProfit },
    { label: 'อัตรากำไรสุทธิ (%)', amount: netProfitMargin }
  ]
}

/** วันที่แบบ YYYY-MM-DD ตามเวลาท้องถิ่น (ไทย) */
function toLocalYmd(timestamp) {
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** ชีต 5: สรุปยอดรายวัน เรียงวันที่เก่า→ใหม่ */
export function buildDailySummaryRows(rows) {
  const byDate = new Map()
  const ensureDay = (date) => {
    if (!byDate.has(date)) {
      byDate.set(date, {
        date,
        orderCount: 0,
        itemQty: 0,
        itemRevenue: 0,
        discount: 0,
        shippingCost: 0,
        orderTotal: 0,
        transferTotal: 0,
        creditTotal: 0,
        otherPaymentTotal: 0
      })
    }
    return byDate.get(date)
  }

  // ค่าระดับรายการสินค้า: รวมทุกแถว
  for (const row of rows) {
    const date = toLocalYmd(row?.Timestamp)
    if (!date) continue
    const day = ensureDay(date)
    const qty = num(row.Qty)
    day.itemQty += qty
    day.itemRevenue = round2(day.itemRevenue + qty * num(row.Price))
  }

  // ค่าระดับออเดอร์: นับครั้งเดียวต่อ OrderID
  const seenOrderIds = new Set()
  for (const row of rows) {
    const orderId = String(row?.OrderID || '').trim()
    const date = toLocalYmd(row?.Timestamp)
    if (!orderId || !date || seenOrderIds.has(orderId)) continue
    seenOrderIds.add(orderId)
    const day = ensureDay(date)
    day.orderCount += 1
    day.discount = round2(day.discount + num(row.Discount))
    day.shippingCost = round2(day.shippingCost + num(row['Shipping Cost']))
    day.orderTotal = round2(day.orderTotal + num(row.Total))
    const paymentMethod = String(row.PaymentMethod || '').trim().toLowerCase()
    if (paymentMethod === 'credit') {
      day.creditTotal = round2(day.creditTotal + num(row.Total))
    } else if (paymentMethod === 'transfer' || !paymentMethod) {
      day.transferTotal = round2(day.transferTotal + num(row.Total))
    } else {
      day.otherPaymentTotal = round2(day.otherPaymentTotal + num(row.Total))
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** ชีต 4: สรุปรวม — คืน array ของ { label, amount } */
export function buildOverallSummaryRows(rows, promotionNameById = new Map()) {
  const orderRecords = collectOrderLevelRecords(rows)

  let totalQty = 0
  let totalItemRevenue = 0
  for (const row of rows) {
    const qty = num(row.Qty)
    totalQty += qty
    totalItemRevenue = round2(totalItemRevenue + qty * num(row.Price))
  }

  let couponTotal = 0
  let promotionTotal = 0
  let couponUseCount = 0
  let promotionUseCount = 0
  let shippingTotal = 0
  let orderTotal = 0
  const byCouponCode = new Map()
  const byPromotionName = new Map()
  const byPayment = new Map()

  for (const rec of orderRecords) {
    orderTotal = round2(orderTotal + rec.total)
    shippingTotal = round2(shippingTotal + rec.shippingCost)

    const payKey = rec.paymentMethod === 'credit' ? 'credit' : rec.paymentMethod === 'transfer' ? 'transfer' : 'other'
    byPayment.set(payKey, round2((byPayment.get(payKey) || 0) + rec.total))

    const { couponCode, couponAmount, promotionAmount, promotionIds } =
      parseDiscountBreakdownForReport(rec.discountInfo, rec.discount)

    if (couponAmount > 0) {
      couponTotal = round2(couponTotal + couponAmount)
      couponUseCount += 1
      const codeKey = couponCode || '(ไม่ระบุชื่อโค้ด)'
      const current = byCouponCode.get(codeKey) || { amount: 0, count: 0 }
      byCouponCode.set(codeKey, {
        amount: round2(current.amount + couponAmount),
        count: current.count + 1
      })
    }
    if (promotionAmount > 0) {
      promotionTotal = round2(promotionTotal + promotionAmount)
      promotionUseCount += 1
      const names = promotionIds
        .map((id) => promotionNameById.get(id))
        .filter(Boolean)
      const nameKey = names.length > 0 ? names.join(' + ') : '(ไม่ระบุชื่อโปรโมชั่น)'
      const current = byPromotionName.get(nameKey) || { amount: 0, count: 0 }
      byPromotionName.set(nameKey, {
        amount: round2(current.amount + promotionAmount),
        count: current.count + 1
      })
    }
  }

  const summary = []
  summary.push({ label: 'จำนวนออเดอร์', amount: orderRecords.length })
  summary.push({ label: 'ยอดขายรวมตามออเดอร์ (บาท)', amount: orderTotal })
  summary.push({ label: 'จำนวนสินค้าที่ขายได้ (ชิ้น)', amount: totalQty })
  summary.push({ label: 'ราคารวมสินค้าที่ขายได้ (บาท)', amount: totalItemRevenue })
  summary.push({ label: 'ส่วนลดรวม (บาท)', amount: round2(couponTotal + promotionTotal) })
  summary.push({ label: 'ส่วนลดจากโค้ดรวม (บาท)', amount: couponTotal })
  summary.push({ label: 'จำนวนการใช้โค้ดส่วนลดรวม (ครั้ง)', amount: couponUseCount })
  for (const [code, value] of [...byCouponCode.entries()].sort((a, b) => b[1].amount - a[1].amount)) {
    summary.push({ label: `  - โค้ด: ${code}`, amount: value.amount })
    summary.push({ label: `  - จำนวนใช้โค้ด: ${code} (ครั้ง)`, amount: value.count })
  }
  summary.push({ label: 'ส่วนลดจากโปรโมชั่นรวม (บาท)', amount: promotionTotal })
  summary.push({ label: 'จำนวนการใช้โปรโมชั่นรวม (ครั้ง)', amount: promotionUseCount })
  for (const [name, value] of [...byPromotionName.entries()].sort((a, b) => b[1].amount - a[1].amount)) {
    summary.push({ label: `  - โปรโมชั่น: ${name}`, amount: value.amount })
    summary.push({ label: `  - จำนวนใช้โปรโมชั่น: ${name} (ครั้ง)`, amount: value.count })
  }
  summary.push({ label: 'ค่าขนส่งรวม (บาท)', amount: shippingTotal })
  summary.push({ label: 'ยอดชำระช่องทางเครดิต (บาท)', amount: byPayment.get('credit') || 0 })
  summary.push({ label: 'ยอดชำระช่องทางโอน (บาท)', amount: byPayment.get('transfer') || 0 })
  if (byPayment.has('other')) {
    summary.push({ label: 'ยอดชำระช่องทางอื่นๆ (บาท)', amount: byPayment.get('other') })
  }
  return summary
}

/**
 * ใส่เส้นตาราง + หัวตารางตัวหนาพื้นเขียว + ฟอร์แมตตัวเลข ให้ทั้งชีต
 * (ต้องใช้ xlsx-js-style — ตัว xlsx ปกติไม่รองรับ cell style)
 */
function applySheetStyle(XLSX, worksheet, { colWidths = [] } = {}) {
  if (!worksheet['!ref']) return
  const range = XLSX.utils.decode_range(worksheet['!ref'])
  const thin = { style: 'thin', color: { rgb: 'B7C4BF' } }
  const border = { top: thin, bottom: thin, left: thin, right: thin }

  for (let r = range.s.r; r <= range.e.r; r++) {
    const isHeader = r === 0
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = worksheet[addr]
      if (!cell) continue
      cell.s = {
        border,
        font: isHeader
          ? { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }
          : { sz: 11 },
        fill: isHeader ? { fgColor: { rgb: '059669' } } : { fgColor: { rgb: r % 2 === 0 ? 'FFFFFF' : 'F3F7F5' } },
        alignment: {
          vertical: 'center',
          horizontal: isHeader ? 'center' : typeof cell.v === 'number' ? 'right' : 'left'
        }
      }
      if (!isHeader && typeof cell.v === 'number') {
        cell.z = Number.isInteger(cell.v) ? '#,##0' : '#,##0.00'
      }
    }
  }
  if (colWidths.length > 0) {
    worksheet['!cols'] = colWidths.map((wch) => ({ wch }))
  }
  worksheet['!rows'] = [{ hpt: 22 }]
}

/** สร้างและดาวน์โหลดไฟล์ Excel หลายชีต */
export async function exportOrderDetailReportXlsx({
  rows,
  promotionNameById = new Map(),
  customerNameByEmail = new Map(),
  productSupplierById = new Map(),
  productCostById = new Map(),
  productCostByName = new Map(),
  rangeLabel = '',
  scopeLabel = ''
}) {
  const XLSX = await import('xlsx-js-style')

  const workbook = XLSX.utils.book_new()

  // ชีต 1: ข้อมูลดิบ
  const rawHeaders = [
    'ลำดับ',
    'วันที่สรุปรายวัน',
    ...RAW_SHEET_COLUMNS.flatMap((col) => (col === 'ProductID' ? [col, 'Supplier'] : [col]))
  ]
  const rawAoa = [rawHeaders]
  rows.forEach((row, i) => {
    rawAoa.push([
      i + 1,
      toLocalYmd(row?.Timestamp),
      ...RAW_SHEET_COLUMNS.flatMap((col) => {
        if (col === 'Username') return [resolveCustomerNameForReport(row, customerNameByEmail)]
        if (col === 'ProductID') {
          return [
            row?.[col] ?? '',
            resolveProductSupplierForReport(row, productSupplierById)
          ]
        }
        return [row?.[col] ?? '']
      })
    ])
  })
  const rawSheet = XLSX.utils.aoa_to_sheet(rawAoa)
  applySheetStyle(XLSX, rawSheet, {
    colWidths: [7, 14, 24, 28, 24, 45, 8, 10, 12, 12, 30, 35, 16, 20, 10, 12, 10, 14, 14, 30, 40, 8, 18, 18, 14, 12, 14, 10, 14]
  })
  XLSX.utils.book_append_sheet(workbook, rawSheet, 'ออเดอร์')

  // ชีต 2: ยอดรวมตามแต่ละออเดอร์
  const orderSummaries = buildOrderSummaryRows(rows, productSupplierById)
  const orderSummaryAoa = [[
    'เลขที่ออเดอร์',
    'วันที่',
    'วันที่สรุปรายวัน',
    'UserEmail',
    'ซัพพลายเออร์',
    'ช่องทางชำระ',
    'ยอดซื้อรวม',
    'ส่วนลด/โปรโมชั่น',
    'ค่าจัดส่ง',
    'สรุปยอดรวมคำสั่งซื้อ',
    'ยอดรวมจากสูตร',
    'ผลต่าง'
  ]]
  orderSummaries.forEach((o) => {
    orderSummaryAoa.push([
      o.orderId,
      o.timestamp,
      o.summaryDate,
      o.userEmail,
      o.supplier,
      paymentMethodLabel(o.paymentMethod),
      o.itemRevenue,
      o.discount,
      o.shippingCost,
      o.orderTotal,
      o.calculatedTotal,
      o.totalDifference
    ])
  })
  const orderSummarySheet = XLSX.utils.aoa_to_sheet(orderSummaryAoa)
  applySheetStyle(XLSX, orderSummarySheet, { colWidths: [24, 24, 16, 30, 22, 14, 16, 18, 14, 22, 16, 12] })
  XLSX.utils.book_append_sheet(workbook, orderSummarySheet, 'ยอดรวมตามออเดอร์')

  // ชีต 3: สรุปลูกค้า
  const customers = buildCustomerSummaryRows(rows, customerNameByEmail)
  const customerAoa = [['ลำดับ', 'อีเมลลูกค้า', 'ชื่อลูกค้า', 'จำนวนออเดอร์', 'จำนวนชิ้น', 'ยอดซื้อรวม (บาท)']]
  customers.forEach((c, i) => {
    customerAoa.push([i + 1, c.userEmail, c.username, c.orderCount, c.itemQty, c.totalSpent])
  })
  const customerSheet = XLSX.utils.aoa_to_sheet(customerAoa)
  applySheetStyle(XLSX, customerSheet, { colWidths: [7, 30, 26, 13, 11, 16] })
  XLSX.utils.book_append_sheet(workbook, customerSheet, 'สรุปยอดซื้อลูกค้า')

  // ชีต 4: สรุปสินค้า
  const products = buildProductSummaryRows(rows)
  const productAoa = [['ลำดับ', 'ชื่อสินค้า', 'จำนวนที่ขายได้ (ชิ้น)', 'ยอดขาย (บาท)']]
  products.forEach((p, i) => {
    productAoa.push([i + 1, p.name, p.qty, p.revenue])
  })
  const productSheet = XLSX.utils.aoa_to_sheet(productAoa)
  applySheetStyle(XLSX, productSheet, { colWidths: [7, 52, 18, 15] })
  XLSX.utils.book_append_sheet(workbook, productSheet, 'สรุปยอดขายสินค้า')

  // ชีต 5: สรุปรวม
  const summary = buildOverallSummaryRows(rows, promotionNameById)
  const summaryAoa = [['ชื่อรายการ', 'ยอดรวม']]
  if (rangeLabel) summaryAoa.push(['ช่วงเวลา', rangeLabel])
  if (scopeLabel) summaryAoa.push(['ขอบเขตออเดอร์', scopeLabel])
  for (const s of summary) {
    summaryAoa.push([s.label, s.amount])
  }
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa)
  applySheetStyle(XLSX, summarySheet, { colWidths: [42, 20] })
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'สรุปรวม')

  // ชีต 6: สรุปยอดรายวัน
  const daily = buildDailySummaryRows(rows)
  const dailyAoa = [[
    'ลำดับ',
    'วันที่',
    'จำนวนออเดอร์',
    'จำนวนชิ้น',
    'ยอดสินค้า (บาท)',
    'ส่วนลด (บาท)',
    'ค่าขนส่ง (บาท)',
    'ยอดชำระโอน (บาท)',
    'ยอดชำระเครดิต (บาท)',
    'ยอดออเดอร์รวม (บาท)'
  ]]
  daily.forEach((d, i) => {
    dailyAoa.push([
      i + 1,
      d.date,
      d.orderCount,
      d.itemQty,
      d.itemRevenue,
      d.discount,
      d.shippingCost,
      d.transferTotal,
      d.creditTotal,
      d.orderTotal
    ])
  })
  const dailySheet = XLSX.utils.aoa_to_sheet(dailyAoa)
  applySheetStyle(XLSX, dailySheet, { colWidths: [7, 13, 13, 11, 15, 13, 14, 16, 18, 18] })
  XLSX.utils.book_append_sheet(workbook, dailySheet, 'สรุปรายวัน')

  // ชีต 7: สรุปงบกำไรขาดทุน
  const profitLoss = buildProfitLossRows(rows, { productCostById, productCostByName })
  const profitLossAoa = [['ชื่อรายการ', 'ยอดรวม']]
  if (rangeLabel) profitLossAoa.push(['ช่วงเวลา', rangeLabel])
  if (scopeLabel) profitLossAoa.push(['ขอบเขตออเดอร์', scopeLabel])
  for (const row of profitLoss) {
    profitLossAoa.push([row.label, row.amount])
  }
  const profitLossSheet = XLSX.utils.aoa_to_sheet(profitLossAoa)
  applySheetStyle(XLSX, profitLossSheet, { colWidths: [36, 20] })
  XLSX.utils.book_append_sheet(workbook, profitLossSheet, 'สรุปงบกำไรขาดทุน')

  const fileName = `รายงานออเดอร์ละเอียด_${rangeLabel ? rangeLabel.replace(/\s+/g, '') : 'ทั้งหมด'}.xlsx`
  XLSX.writeFile(workbook, fileName)
  return { fileName, rowCount: rows.length, orderCount: collectOrderLevelRecords(rows).length }
}
