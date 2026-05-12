import { useState, useEffect } from 'react'
import { normalizeProduct } from '../utils/helpers'
import { makeCartLineId, normalizeSelectedOptions } from '../utils/productCatalog'
import { getPricingShapeFromProduct, resolveCartUnitPrice } from '../utils/priceTiers'

function lineUnitPrice(item, qty, userType) {
  const shape = getPricingShapeFromProduct(item)
  if (!shape) return Number(item.price || 0) || 0
  const opt = Number(item.optionExtraPerUnit || 0)
  return resolveCartUnitPrice(shape, qty, userType, opt)
}

export function useCart(user = null) {
  const [cart, setCart] = useState([])

  // Get userType from user object
  const userType = user?.userType || user?.customerType || 'regular'

  // Load cart from localStorage on mount and when user changes
  useEffect(() => {
    const savedCart = localStorage.getItem('sao_cafe_cart')
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Normalize cart items with userType to ensure correct price
          const normalizedCart = parsed.map(item => {
            // Re-normalize product with userType to get correct price (regular/franchise)
            const normalized = normalizeProduct(item, userType)
            const selectedOptions = normalizeSelectedOptions(item.selectedOptions)
            const bundleSelections = item.bundleSelections && typeof item.bundleSelections === 'object' ? item.bundleSelections : null
            const lineId = item.lineId || makeCartLineId(normalized?.id || item.id, selectedOptions, bundleSelections)
            const qty = item.qty || 1
            const withTierFields = {
              ...normalized,
              tierBasis: item.tierBasis || normalized.tierBasis,
              optionExtraPerUnit: item.optionExtraPerUnit ?? normalized.optionExtraPerUnit
            }
            const price = lineUnitPrice(withTierFields, qty, userType)
            return {
              ...withTierFields,
              lineId,
              productId: normalized?.id || item.id,
              selectedOptions,
              bundleSelections,
              bundleSelectionSummary: item.bundleSelectionSummary || '',
              qty,
              price,
              // Ensure unit is present and correct
              unit: normalized?.unit || item.unit || item.Unit || 'ชิ้น'
            }
          })
          setCart(normalizedCart)
          console.log('Cart loaded from localStorage:', normalizedCart.length, 'items', 'userType:', userType)
        }
      } catch (e) {
        console.error('Error parsing cart from localStorage:', e)
        localStorage.removeItem('sao_cafe_cart')
      }
    }
  }, [userType])

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (cart.length > 0) {
      localStorage.setItem('sao_cafe_cart', JSON.stringify(cart))
      console.log('Cart saved to localStorage:', cart.length, 'items')
    } else {
      localStorage.removeItem('sao_cafe_cart')
      console.log('Cart cleared from localStorage')
    }
  }, [cart])

  const addToCart = (product, quantity = 1, selectedOptions = {}, bundleSelections = null, bundleSelectionSummary = '') => {
    const orderStep = Math.max(1, product.orderStep || 1)
    const roundedQty = Math.round(quantity / orderStep) * orderStep
    const finalQuantity = roundedQty < orderStep ? orderStep : roundedQty
    const lineId = makeCartLineId(product.id, selectedOptions, bundleSelections)

    setCart(prev => {
      const existing = prev.find(item => (item.lineId || item.id) === lineId)
      if (existing) {
        const step = Math.max(1, existing.orderStep || 1)
        const currentStock = product.stock !== undefined ? product.stock : existing.stock || 0
        const newQty = Math.round((existing.qty + finalQuantity) / step) * step
        const cappedQty = currentStock > 0 && newQty > currentStock ? Math.floor(currentStock / step) * step : newQty
        const finalQty = cappedQty < step ? existing.qty : cappedQty

        const opt = Number(existing.optionExtraPerUnit ?? product.optionExtraPerUnit ?? 0)
        const mergedLine = {
          ...existing,
          ...product,
          tierBasis: product.tierBasis ?? existing.tierBasis,
          optionExtraPerUnit: opt
        }
        const nextPrice = lineUnitPrice(mergedLine, finalQty, userType)
        if (currentStock > 0 && newQty > currentStock) {
          return prev.map(item =>
            (item.lineId || item.id) === lineId
              ? { ...mergedLine, qty: finalQty, stock: currentStock, price: nextPrice }
              : item
          )
        }
        return prev.map(item =>
          (item.lineId || item.id) === lineId
            ? { ...mergedLine, qty: finalQty, stock: currentStock, price: nextPrice }
            : item
        )
      }
      const unit = product.unit || product.Unit || product['หน่วย'] || 'ชิ้น'
      const finalUnit = String(unit).trim() || 'ชิ้น'
      const currentStock = product.stock !== undefined ? product.stock : 0
      const qty = currentStock > 0 && finalQuantity > currentStock
        ? Math.floor(currentStock / orderStep) * orderStep
        : finalQuantity

      const finalQty = qty < orderStep ? orderStep : qty
      const opt = Number(product.optionExtraPerUnit ?? 0)
      const linePayload = {
        ...product,
        optionExtraPerUnit: opt,
        lineId,
        productId: product.id,
        selectedOptions: normalizeSelectedOptions(selectedOptions),
        bundleSelections: bundleSelections && typeof bundleSelections === 'object' ? bundleSelections : null,
        bundleSelectionSummary: bundleSelectionSummary || '',
        qty: finalQty,
        stock: currentStock,
        unit: finalUnit,
        orderStep
      }
      const price = lineUnitPrice(linePayload, finalQty, userType)
      return [...prev, { ...linePayload, price }]
    })
  }

  const removeFromCart = (lineIdOrProductId) => {
    setCart(prev => prev.filter(item => (item.lineId || item.id) !== lineIdOrProductId))
  }

  const updateQuantity = (lineIdOrProductId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(lineIdOrProductId)
      return
    }
    setCart(prev =>
      prev.map(item => {
        if ((item.lineId || item.id) !== lineIdOrProductId) return item
        const step = Math.max(1, item.orderStep || 1)
        const rounded = Math.round(quantity / step) * step
        const qty = rounded < step ? step : rounded
        const price = lineUnitPrice(item, qty, userType)
        return { ...item, qty, price }
      })
    )
  }

  // Update cart items with latest stock from products array
  const updateCartStock = (products) => {
    if (!products || products.length === 0) return
    setCart(prev =>
      prev.map(item => {
        const product = products.find(p => p.id === item.id)
        if (product) {
          const next = {
            ...item,
            stock: product.stock || 0,
            orderStep: item.orderStep ?? product.orderStep ?? 1
          }
          const qty = Number(next.qty) || 0
          return { ...next, price: lineUnitPrice(next, qty, userType) }
        }
        return { ...item, price: lineUnitPrice(item, Number(item.qty) || 0, userType) }
      })
    )
  }

  const clearCart = () => {
    setCart([])
    localStorage.removeItem('sao_cafe_cart')
  }

  const getTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.qty), 0)
  }

  const getTotalWeight = () => {
    return cart.reduce((sum, item) => sum + ((item.weight || 0) * item.qty), 0)
  }

  const getItemCount = () => {
    return cart.reduce((sum, item) => sum + item.qty, 0)
  }

  return {
    cart,
    setCart,
    addToCart,
    removeFromCart,
    updateQuantity,
    updateCartStock,
    clearCart,
    getTotal,
    getTotalWeight,
    getItemCount
  }
}
