import { parseAllowedViewerEmails, parseProductOptions } from './productCatalog'
import { parsePriceTiers } from './priceTiers'

// Helper: Normalize product field names (Supabase uses PascalCase: ProductID, ProductName, etc.)
// Note: Column name in Supabase is now 'Unit' (English) after rename
// userType: 'franchise' or 'regular' - determines which price to use
export const normalizeProduct = (product, userType = 'regular') => {
  if (!product) return null
  
  // Handle unit column - Column name is now 'Unit' (English) in Supabase
  // Priority order:
  // 1. Unit (English - current column name after rename)
  // 2. หน่วย (Thai - fallback for old data)
  // 3. unit (lowercase - fallback)
  let unit = 'ชิ้น' // default
  
  // Check Unit first (current column name)
  if (product.Unit !== undefined && product.Unit !== null && product.Unit !== '') {
    unit = String(product.Unit).trim()
  } 
  // Fallback to Thai column name (for backward compatibility)
  else if (product['หน่วย'] !== undefined && product['หน่วย'] !== null && product['หน่วย'] !== '') {
    unit = String(product['หน่วย']).trim()
  } 
  // Fallback to lowercase
  else if (product.unit !== undefined && product.unit !== null && product.unit !== '') {
    unit = String(product.unit).trim()
  }
  
  // Ensure unit is not empty
  if (!unit || unit === '') {
    unit = 'ชิ้น'
  }
  
  // Get prices from Supabase
  // Column D (index 3): Price (ราคาปกติสำหรับ regular customer)
  const regularPrice = (product.Price !== undefined && product.Price !== null && product.Price !== '') 
    ? Number(product.Price) 
    : (product.price !== undefined && product.price !== null && product.price !== '') 
      ? Number(product.price) 
      : 0
  
  // Column L (index 11): FranchisePrice (ราคาแฟรนไชส์สำหรับ franchise customer)
  let franchisePrice = 0
  if (product.FranchisePrice !== undefined && product.FranchisePrice !== null && product.FranchisePrice !== '') {
    const franchisePriceValue = Number(product.FranchisePrice)
    if (!isNaN(franchisePriceValue)) {
      franchisePrice = franchisePriceValue
    }
  } else if (product.franchise_price !== undefined && product.franchise_price !== null && product.franchise_price !== '') {
    const franchisePriceValue = Number(product.franchise_price)
    if (!isNaN(franchisePriceValue)) {
      franchisePrice = franchisePriceValue
    }
  } else if (product.franchisePrice !== undefined && product.franchisePrice !== null && product.franchisePrice !== '') {
    const franchisePriceValue = Number(product.franchisePrice)
    if (!isNaN(franchisePriceValue)) {
      franchisePrice = franchisePriceValue
    }
  }
  
  // กำหนดราคาตาม userType ตามที่ระบุ:
  // UserType: franchise → ใช้ FranchisePrice
  // UserType: regular → ใช้ Price
  let price
  if (userType === 'franchise') {
    // ถ้าเป็น franchise ให้ใช้ FranchisePrice เสมอ
    price = franchisePrice > 0 ? franchisePrice : regularPrice // Fallback to regular price if franchise price is 0
  } else {
    // ถ้าเป็น regular ให้ใช้ Price เสมอ
    price = regularPrice
  }
  
  // Get Cost (ต้นทุน)
  const cost = (product.Cost !== undefined && product.Cost !== null && product.Cost !== '') 
    ? Number(product.Cost) 
    : (product.cost !== undefined && product.cost !== null && product.cost !== '') 
      ? Number(product.cost) 
      : 0

  const rawVisibleTypes = (() => {
    const v = product.VisibleUserTypes ?? product.visible_user_types
    if (v == null || v === '') return ['regular', 'franchise']
    if (Array.isArray(v)) {
      return v.map((x) => String(x).toLowerCase().trim()).filter(Boolean)
    }
    if (typeof v === 'string') {
      try {
        const j = JSON.parse(v)
        return Array.isArray(j) ? j.map((x) => String(x).toLowerCase().trim()).filter(Boolean) : ['regular', 'franchise']
      } catch {
        return ['regular', 'franchise']
      }
    }
    return ['regular', 'franchise']
  })()

  return {
    ...product,
    id: product.ProductID || product.id || product.product_id || '',
    name: product.ProductName || product.name || product.product_name || '',
    image: product.Image || product.image || '',
    price: price, // Use price based on userType
    regularPrice: regularPrice, // Keep original regular price
    franchisePrice: franchisePrice, // Keep original franchise price
    cost: cost, // Cost (ต้นทุน)
    stock: product.Stock || product.stock || 0,
    category: product.Category || product.category || '',
    detail: product.Detail || product.detail || '',
    supplier: product.Supplier || product.supplier || '',
    unit: unit, // Use the normalized unit
    weight: product['Weight (grams)'] || product.Weight || product['น้ำหนัก (กรัม)'] || product.weight || 0,
    minStock: product.MinStock || product.Min || product.min_stock || product.minStock || 5,
    franchiseAvailable: product.FranchiseAvailable !== undefined ? product.FranchiseAvailable : (product.franchise_available !== undefined ? product.franchise_available : true),
    orderStep: Math.max(1, parseInt(product.OrderStep || product.order_step || 1, 10) || 1),
    shopHidden: product.ShopHidden === true || product.shop_hidden === true,
    visibleOnHome: !(product.ShopHidden === true || product.shop_hidden === true),
    saleToFranchise: rawVisibleTypes.includes('franchise'),
    saleToRegular: rawVisibleTypes.includes('regular'),
    saleRestrictedToUsers: product.SaleRestrictedToUsers === true || product.sale_restricted_to_users === true,
    allowedViewerEmails: parseAllowedViewerEmails(product.AllowedViewerEmails ?? product.allowed_viewer_emails),
    productOptions: parseProductOptions(product.ProductOptions ?? product.product_options),
    isBundle: product.IsBundle === true || product.is_bundle === true,
    bundleFlexible: product.BundleFlexible === true || product.bundle_flexible === true,
    bundlePrimaryProductId: product.BundlePrimaryProductId || product.bundle_primary_product_id || null,
    bundleLines: (() => {
      const raw = product.BundleLines ?? product.bundle_lines
      if (Array.isArray(raw)) return raw
      if (typeof raw === 'string' && raw.trim()) {
        try { return JSON.parse(raw) } catch { return [] }
      }
      return []
    })(),
    bundleComponentSumEqualsPrimary:
      product.BundleComponentSumEqualsPrimary === true ||
      product.bundle_component_sum_equals_primary === true,
    visibleUserTypes: rawVisibleTypes,
    priceTiers: parsePriceTiers(product.PriceTiers ?? product.price_tiers ?? product.priceTiers)
  }
}

/** กรองสินค้าสำหรับหน้าร้าน — แอดมินเห็นทั้งหมด */
export function filterProductsForShopCatalog(products, user) {
  if (!products || products.length === 0) return []
  if (user?.role === 'admin') return products
  const email = String(user?.email || '').toLowerCase().trim()
  const userType =
    (user?.userType || user?.customerType || 'regular').toLowerCase().trim() === 'franchise'
      ? 'franchise'
      : 'regular'
  return products.filter((p) => {
    if (!p.visibleOnHome || p.shopHidden) return false
    if (p.saleRestrictedToUsers) {
      const list = Array.isArray(p.allowedViewerEmails) ? p.allowedViewerEmails : []
      if (list.length === 0) return false
      return email && list.includes(email)
    }
    const types =
      Array.isArray(p.visibleUserTypes) && p.visibleUserTypes.length > 0
        ? p.visibleUserTypes
        : ['regular', 'franchise']
    if (userType === 'franchise') return p.saleToFranchise ?? types.includes('franchise')
    return p.saleToRegular ?? types.includes('regular')
  })
}

// Helper: Normalize products array
// userType: 'franchise' or 'regular' - determines which price to use
export const normalizeProducts = (products, userType = 'regular') =>
  (products || []).map((p) => normalizeProduct(p, userType))

// Parse Thai Date (DD/MM/YYYY)
export const parseThaiDate = (dateStr) => {
  if (!dateStr) return null
  try {
    const parts = dateStr.split(' ')[0].split('/')
    if (parts.length !== 3) return null
    let year = parseInt(parts[2], 10)
    if (year > 2400) year -= 543
    const date = new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10))
    date.setHours(0, 0, 0, 0)
    return date
  } catch (e) {
    return null
  }
}

// Parse ISO Date (YYYY-MM-DD)
export const parseISODate = (dateStr) => {
  if (!dateStr) return null
  try {
    const date = new Date(dateStr + 'T00:00:00')
    date.setHours(0, 0, 0, 0)
    return date
  } catch (e) {
    return null
  }
}

// Escape HTML and template literal special characters
export const escapeHtml = (str) => {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/`/g, '&#96;')
    .replace(/\$/g, '&#36;')
}

// Format date to YYYY-MM-DD
export const formatDateForInput = (date) => {
  if (!date) return ''
  if (date instanceof Date) {
    return date.toISOString().split('T')[0]
  }
  if (typeof date === 'string') {
    const parsed = parseISODate(date) || parseThaiDate(date)
    return parsed ? parsed.toISOString().split('T')[0] : ''
  }
  return ''
}

export function parseAllowedViewerEmailsFromText(text) {
  const raw = String(text || '')
  if (!raw.trim()) return []
  return Array.from(
    new Set(
      raw
        .split(/[\s,\n\r，]+/g)
        .map((x) => String(x || '').trim().toLowerCase())
        .filter((x) => x.includes('@'))
    )
  )
}

export function allowedViewerEmailsToFormText(list) {
  const arr = Array.isArray(list) ? list : parseAllowedViewerEmails(list)
  return (arr || []).join('\n')
}

export function mergeEmailIntoAllowedViewerText(text, email) {
  const base = parseAllowedViewerEmailsFromText(text)
  const e = String(email || '').trim().toLowerCase()
  if (e && !base.includes(e)) base.push(e)
  return base.join('\n')
}
