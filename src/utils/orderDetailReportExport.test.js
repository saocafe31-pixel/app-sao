import { describe, it, expect } from 'vitest'
import {
  buildCustomerSummaryRows,
  buildDailySummaryRows,
  buildOverallSummaryRows,
  buildOrderSummaryRows,
  buildProfitLossRows,
  buildProductSummaryRows,
  parseDiscountBreakdownForReport,
  resolveCustomerNameForReport,
  resolveProductSupplierForReport
} from './orderDetailReportExport'

/** ออเดอร์ 2 ใบ: A มี 2 แถว (Total/ค่าส่ง/ส่วนลดซ้ำทุกแถว), B มี 1 แถว */
const sampleRows = [
  {
    OrderID: 'ORD-A',
    UserEmail: 'a@test.com',
    Username: 'ลูกค้า A',
    ProductID: 'A001',
    Itemname: 'กาแฟดอยชาว 500 กรัม',
    Qty: 2,
    Price: 300,
    Total: 760,
    Status: 'จัดส่งแล้ว',
    Discount: 50,
    'Shipping Cost': 210,
    PaymentMethod: 'transfer',
    DiscountInfo: 'Code: SAVE50 (-50B) | Supplier: ส่วนกลาง | Batch: BATCH123-7BYKTE',
    Timestamp: '2026-06-01T10:00:00+07:00'
  },
  {
    OrderID: 'ORD-A',
    UserEmail: 'a@test.com',
    Username: 'ลูกค้า A',
    ProductID: 'A018',
    Itemname: 'ใบชาไต้หวันพรีเมียม 500 กรัม',
    Qty: 1,
    Price: 250,
    Total: 760,
    Status: 'จัดส่งแล้ว',
    Discount: 50,
    'Shipping Cost': 210,
    PaymentMethod: 'transfer',
    DiscountInfo: 'Code: SAVE50 (-50B) | Supplier: ส่วนกลาง | Batch: BATCH123-7BYKTE',
    Timestamp: '2026-06-01T15:30:00+07:00'
  },
  {
    OrderID: 'ORD-B',
    UserEmail: 'b@test.com',
    Username: 'ลูกค้า B',
    ProductID: 'A001',
    Itemname: 'กาแฟดอยชาว 500 กรัม',
    Qty: 5,
    Price: 300,
    Total: 1450,
    Status: 'จัดส่งแล้ว',
    Discount: 100,
    'Shipping Cost': 50,
    PaymentMethod: 'credit',
    DiscountInfo: 'Promotion: -100B | PromoIds: 7',
    Timestamp: '2026-06-02T09:00:00+07:00'
  }
]

describe('orderDetailReportExport', () => {
  it('parses coupon code and amount', () => {
    const r = parseDiscountBreakdownForReport('Code: SAVE50 (-50B)', 50)
    expect(r.couponCode).toBe('SAVE50')
    expect(r.couponAmount).toBe(50)
    expect(r.promotionAmount).toBe(0)
  })

  it('parses promotion amount and promo ids', () => {
    const r = parseDiscountBreakdownForReport('Promotion: -100B | PromoIds: 7, 9', 100)
    expect(r.couponAmount).toBe(0)
    expect(r.promotionAmount).toBe(100)
    expect(r.promotionIds).toEqual([7, 9])
  })

  it('splits coupon + promotion when order discount exceeds coupon', () => {
    const r = parseDiscountBreakdownForReport('Code: X (-30B) | PromoIds: 2', 80)
    expect(r.couponAmount).toBe(30)
    expect(r.promotionAmount).toBe(50)
  })

  it('does not parse batch id as discount', () => {
    const r = parseDiscountBreakdownForReport(
      'Supplier: ส่วนกลาง | Batch: BATCH1779854301697-7BYKTE',
      0
    )
    expect(r.couponAmount).toBe(0)
    expect(r.promotionAmount).toBe(0)
  })

  it('customer summary dedupes order total per OrderID and sorts desc', () => {
    const customers = buildCustomerSummaryRows(sampleRows)
    expect(customers).toHaveLength(2)
    expect(customers[0].userEmail).toBe('b@test.com')
    expect(customers[0].totalSpent).toBe(1450)
    expect(customers[1].totalSpent).toBe(760) // ไม่ใช่ 1520 (Total ซ้ำ 2 แถว)
    expect(customers[1].itemQty).toBe(3)
  })

  it('customer summary uses profile username when order username is only email', () => {
    const rows = sampleRows.map((row) => ({
      ...row,
      Username: row.UserEmail
    }))
    const profileNames = new Map([
      ['a@test.com', 'ร้าน A'],
      ['b@test.com', 'ร้าน B']
    ])
    const customers = buildCustomerSummaryRows(rows, profileNames)

    expect(customers[0].userEmail).toBe('b@test.com')
    expect(customers[0].username).toBe('ร้าน B')
    expect(customers[1].userEmail).toBe('a@test.com')
    expect(customers[1].username).toBe('ร้าน A')
  })

  it('resolves raw order Username from profile when snapshot is email', () => {
    const row = {
      UserEmail: 'customer@example.com',
      Username: 'customer@example.com'
    }
    const profileNames = new Map([['customer@example.com', 'ร้านลูกค้า']])

    expect(resolveCustomerNameForReport(row, profileNames)).toBe('ร้านลูกค้า')
  })

  it('resolves product supplier from product map with DiscountInfo fallback', () => {
    const supplierMap = new Map([['a001', 'ส่วนกลาง']])
    expect(resolveProductSupplierForReport({ ProductID: 'A001' }, supplierMap)).toBe('ส่วนกลาง')
    expect(resolveProductSupplierForReport({
      ProductID: 'UNKNOWN',
      DiscountInfo: 'Supplier: แก้วSAO CAFE | Batch: BATCH123'
    }, supplierMap)).toBe('แก้วSAO CAFE')
  })

  it('product summary sums qty and revenue per item, sorted by qty', () => {
    const products = buildProductSummaryRows(sampleRows)
    expect(products[0].name).toBe('กาแฟดอยชาว 500 กรัม')
    expect(products[0].qty).toBe(7)
    expect(products[0].revenue).toBe(2100)
  })

  it('order summary sums item revenue but dedupes order-level values per OrderID', () => {
    const orders = buildOrderSummaryRows(sampleRows, new Map([
      ['a001', 'ส่วนกลาง'],
      ['a018', 'ชา/วัตถุดิบ']
    ]))
    expect(orders).toHaveLength(2)
    expect(orders[0]).toEqual({
      orderId: 'ORD-A',
      timestamp: '2026-06-01T10:00:00+07:00',
      summaryDate: '2026-06-01',
      userEmail: 'a@test.com',
      suppliers: expect.any(Set),
      supplier: 'ชา/วัตถุดิบ, ส่วนกลาง',
      paymentMethod: 'transfer',
      itemRevenue: 850,
      discount: 50,
      shippingCost: 210,
      orderTotal: 760,
      calculatedTotal: 1010,
      totalDifference: -250
    })
    expect(orders[1]).toEqual({
      orderId: 'ORD-B',
      timestamp: '2026-06-02T09:00:00+07:00',
      summaryDate: '2026-06-02',
      userEmail: 'b@test.com',
      suppliers: expect.any(Set),
      supplier: 'ส่วนกลาง',
      paymentMethod: 'credit',
      itemRevenue: 1500,
      discount: 100,
      shippingCost: 50,
      orderTotal: 1450,
      calculatedTotal: 1450,
      totalDifference: 0
    })
  })

  it('overall summary dedupes shipping, splits discounts and payment methods', () => {
    const promoNames = new Map([[7, 'โปรลดพิเศษ']])
    const summary = buildOverallSummaryRows(sampleRows, promoNames)
    const get = (label) => summary.find((s) => s.label === label)?.amount

    expect(get('จำนวนออเดอร์')).toBe(2)
    expect(get('ยอดขายรวมตามออเดอร์ (บาท)')).toBe(2210)
    expect(get('จำนวนสินค้าที่ขายได้ (ชิ้น)')).toBe(8)
    expect(get('ราคารวมสินค้าที่ขายได้ (บาท)')).toBe(2350)
    expect(get('ส่วนลดจากโค้ดรวม (บาท)')).toBe(50)
    expect(get('จำนวนการใช้โค้ดส่วนลดรวม (ครั้ง)')).toBe(1)
    expect(get('  - โค้ด: SAVE50')).toBe(50)
    expect(get('  - จำนวนใช้โค้ด: SAVE50 (ครั้ง)')).toBe(1)
    expect(get('ส่วนลดจากโปรโมชั่นรวม (บาท)')).toBe(100)
    expect(get('จำนวนการใช้โปรโมชั่นรวม (ครั้ง)')).toBe(1)
    expect(get('  - โปรโมชั่น: โปรลดพิเศษ')).toBe(100)
    expect(get('  - จำนวนใช้โปรโมชั่น: โปรลดพิเศษ (ครั้ง)')).toBe(1)
    expect(get('ค่าขนส่งรวม (บาท)')).toBe(260) // 210 (นับครั้งเดียว) + 50
    expect(get('ยอดชำระช่องทางเครดิต (บาท)')).toBe(1450)
    expect(get('ยอดชำระช่องทางโอน (บาท)')).toBe(760)
  })

  it('profit/loss summary uses reconciled sales total plus recorded order variance', () => {
    const rows = buildProfitLossRows(sampleRows, {
      productCostById: new Map([
        ['a001', 100],
        ['a018', 80]
      ])
    })
    const get = (label) => rows.find((s) => s.label === label)?.amount

    expect(get('รายได้จากสินค้า (บาท)')).toBe(2350)
    expect(get('หัก ส่วนลด/โปรโมชั่น (บาท)')).toBe(150)
    expect(get('บวก ค่าจัดส่งรวม (บาท)')).toBe(260)
    expect(get('ยอดขายสุทธิจากสูตร (บาท)')).toBe(2460)
    expect(get('ยอดขายรวมที่บันทึกในออเดอร์ (บาท)')).toBe(2210)
    expect(get('ผลต่างยอดบันทึกกับสูตร (บาท)')).toBe(-250)
    expect(get('หัก ต้นทุนสินค้า (บาท)')).toBe(780)
    expect(get('กำไรขั้นต้นก่อนค่าจัดส่ง (บาท)')).toBe(1420)
    expect(get('กำไรสุทธิ (บาท)')).toBe(1420)
    expect(get('อัตรากำไรสุทธิ (%)')).toBe(57.72)
  })

  it('daily summary groups by local date, dedupes order-level values, sorted ascending', () => {
    const daily = buildDailySummaryRows(sampleRows)
    expect(daily).toHaveLength(2)

    expect(daily[0].date).toBe('2026-06-01')
    expect(daily[0].orderCount).toBe(1)
    expect(daily[0].itemQty).toBe(3)
    expect(daily[0].itemRevenue).toBe(850) // 2*300 + 1*250
    expect(daily[0].discount).toBe(50) // นับครั้งเดียว ไม่ใช่ 100
    expect(daily[0].shippingCost).toBe(210)
    expect(daily[0].transferTotal).toBe(760)
    expect(daily[0].creditTotal).toBe(0)
    expect(daily[0].orderTotal).toBe(760)

    expect(daily[1].date).toBe('2026-06-02')
    expect(daily[1].orderCount).toBe(1)
    expect(daily[1].itemQty).toBe(5)
    expect(daily[1].transferTotal).toBe(0)
    expect(daily[1].creditTotal).toBe(1450)
    expect(daily[1].orderTotal).toBe(1450)
  })
})
