import { describe, it, expect } from 'vitest'
import {
  computePromotionMoneyDiscount,
  computeSecondItemPromotionDiscount,
  eligibleSubtotalForFreeShippingPromotion,
  getPromotionPaidQty,
  getPromotionScopedPaidQty,
  getPromotionStockRemaining,
  getSecondItemDiscountUnits,
  isFreeShippingPromotion,
  isPromotionVisibleToCustomer,
  isPromotionWithinUsageLimits,
  isPromotionWithinValidDates,
  parsePromotionIdsFromDiscountInfo,
  promotionDateInputToIsoRange
} from './promotionUtils'

describe('promotionUtils', () => {
  it('counts paid qty excluding free from same promo', () => {
    const item = { qty: 5, isFree: true, freeQty: 2, promotionId: 'p1' }
    expect(getPromotionPaidQty(item, 'p1')).toBe(3)
  })

  it('fixed discount applies per unit', () => {
    const promo = { id: 'p1', Type: 'discount_fixed', DiscountAmount: 10 }
    const item = { id: 'A1', price: 300, qty: 2 }
    expect(computePromotionMoneyDiscount(promo, item)).toBe(20)
  })

  it('target unit price discount from list price', () => {
    const promo = { id: 'p1', Type: 'target_unit_price', DiscountAmount: 290 }
    const item = { id: 'A1', price: 310, qty: 1 }
    expect(computePromotionMoneyDiscount(promo, item)).toBe(20)
  })

  it('valid until end of calendar day', () => {
    const untilIso = promotionDateInputToIsoRange('2026-04-30', 'until')
    const promo = { ValidUntil: untilIso }
    const noon = new Date(2026, 3, 30, 12, 0, 0)
    expect(isPromotionWithinValidDates(promo, noon)).toBe(true)
  })

  it('second item discount units', () => {
    expect(getSecondItemDiscountUnits(1)).toBe(0)
    expect(getSecondItemDiscountUnits(2)).toBe(1)
    expect(getSecondItemDiscountUnits(4)).toBe(2)
  })

  it('second item percent discount on 2nd and 4th units', () => {
    const promo = { id: 'p2', Type: 'second_item_discount', DiscountPercentage: 50 }
    const item = { id: 'A1', price: 100, qty: 4 }
    expect(computeSecondItemPromotionDiscount(promo, item)).toBe(100)
  })

  it('second item fixed baht per discounted unit', () => {
    const promo = { id: 'p2', Type: 'second_item_discount', DiscountAmount: 30 }
    const item = { id: 'A1', price: 100, qty: 3 }
    expect(computeSecondItemPromotionDiscount(promo, item)).toBe(30)
  })

  it('parses PromoIds from discount info', () => {
    expect(parsePromotionIdsFromDiscountInfo('Code: X | PromoIds: 3, 7')).toEqual([3, 7])
  })

  it('usage limits block when total cap reached', () => {
    const promo = { id: 1, TotalUsageLimit: 10, UsageCount: 10, UsageLimit: 0 }
    expect(isPromotionWithinUsageLimits(promo)).toBe(false)
  })

  it('customer type scope only allows matching customers', () => {
    expect(isPromotionVisibleToCustomer({ CustomerTypeScope: 'franchise' }, 'franchise')).toBe(true)
    expect(isPromotionVisibleToCustomer({ CustomerTypeScope: 'franchise' }, 'regular')).toBe(false)
    expect(isPromotionVisibleToCustomer({ CustomerTypeScope: 'all' }, 'regular')).toBe(true)
  })

  it('promotion stock limit caps paid quantity', () => {
    const promo = { id: 'p1', PromotionStockLimit: 5, PromotionStockUsed: 3 }
    const item = { id: 'A1', qty: 4, stock: 10 }
    expect(getPromotionStockRemaining(promo, item)).toBe(2)
    expect(getPromotionScopedPaidQty(promo, item)).toBe(2)
  })

  it('zero promotion stock limit falls back to real stock', () => {
    const promo = { id: 'p1', PromotionStockLimit: 0, PromotionStockUsed: 0 }
    const item = { id: 'A1', qty: 4, stock: 3 }
    expect(getPromotionStockRemaining(promo, item)).toBe(3)
    expect(getPromotionScopedPaidQty(promo, item)).toBe(3)
  })

  it('free shipping promotion only counts participating supplier subtotal', () => {
    const promo = {
      id: 'ship1',
      Type: 'free_shipping_min_purchase',
      __allowedSupplierKeys: ['ส่วนกลาง']
    }
    const cart = [
      { id: 'A1', supplierKey: 'ส่วนกลาง', price: 300, qty: 2 },
      { id: 'B1', supplierKey: 'แก้วSAO CAFE', price: 900, qty: 1 }
    ]

    expect(isFreeShippingPromotion(promo)).toBe(true)
    expect(
      eligibleSubtotalForFreeShippingPromotion(
        cart,
        promo,
        (item) => item.supplierKey,
        (item) => item.price * item.qty
      )
    ).toBe(600)
  })
})
