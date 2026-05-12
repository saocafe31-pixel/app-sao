import { supabase } from '../utils/supabase'
import { normalizeProduct, normalizeProducts, filterProductsForShopCatalog } from '../utils/helpers'
import {
  parseAllowedViewerEmailsFromText,
  serializeAllowedViewerEmailsToJson,
  sanitizeProductOptionsForDb
} from '../utils/productCatalog'
import { sanitizePriceTiersForDb } from '../utils/priceTiers'

export const productService = {
  sanitizeProductOptionsForDb,
  parseAllowedViewerEmailsFromText,
  serializeAllowedViewerEmailsToJson,
  // Get products with pagination
  // If itemsPerPage is null or 0, fetch all products without pagination
  async getProducts(user, page = 0, itemsPerPage = 50, search = '') {
    // If itemsPerPage is null or 0, fetch all products using recursive method
    if (!itemsPerPage || itemsPerPage === 0) {
      return this.getAllProducts(user, search)
    }

    let query = supabase
      .from('products')
      .select('*')

    // Note: No need to filter by FranchiseAvailable since we use price-based filtering
    // Franchise users will see all products but with FranchisePrice
    // Regular users will see all products with regular Price

    // Apply search - search in ProductName, Category, Supplier, and ProductID
    if (search && search.trim()) {
      const searchTerm = search.trim()
      // Use or() to search across multiple columns
      query = query.or(`ProductName.ilike.%${searchTerm}%,Category.ilike.%${searchTerm}%,Supplier.ilike.%${searchTerm}%,ProductID.ilike.%${searchTerm}%`)
    }

    // Apply pagination
    const from = page * itemsPerPage
    const to = from + itemsPerPage - 1
    query = query.range(from, to).order('ProductName', { ascending: true })

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    // Get userType from user object (userType or customerType)
    const userType = user?.userType || user?.customerType || 'regular'
    const normalized = normalizeProducts(data || [], userType)
    return filterProductsForShopCatalog(normalized, user)
  },

  // Get all products without pagination limit (recursive fetch)
  async getAllProducts(user, search = '') {
    let allProducts = []
    let from = 0
    const batchSize = 1000 // Supabase default limit
    let hasMore = true

    while (hasMore) {
      let query = supabase
        .from('products')
        .select('*')

      // Apply search if provided
      if (search && search.trim()) {
        const searchTerm = search.trim()
        query = query.or(`ProductName.ilike.%${searchTerm}%,Category.ilike.%${searchTerm}%,Supplier.ilike.%${searchTerm}%,ProductID.ilike.%${searchTerm}%`)
      }

      query = query.range(from, from + batchSize - 1).order('ProductName', { ascending: true })

      const { data, error } = await query

      if (error) {
        throw new Error(error.message)
      }

      if (data && data.length > 0) {
        allProducts = allProducts.concat(data)
        from += batchSize
        hasMore = data.length === batchSize // If we got less than batchSize, we've reached the end
      } else {
        hasMore = false
      }
    }

    // Get userType from user object (userType or customerType)
    const userType = user?.userType || user?.customerType || 'regular'
    const normalized = normalizeProducts(allProducts, userType)
    return filterProductsForShopCatalog(normalized, user)
  },

  // Get single product (ใช้ limit(1) แทน maybeSingle เพื่อไม่ให้ error เมื่อมีหลายแถว ProductID ซ้ำ)
  async getProduct(productId) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('ProductID', productId)
      .limit(1)

    if (error) {
      throw new Error(error.message)
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null
    return row ? normalizeProduct(row, 'regular') : null
  },

  /** ตรวจสอบว่ารหัสสินค้า (ProductID) มีอยู่ในระบบแล้วหรือไม่ — ใช้ป้องกันการเพิ่มรหัสซ้ำ */
  async isProductIdExists(productId) {
    if (!productId || String(productId).trim() === '') return false
    const id = String(productId).trim()
    const { data, error } = await supabase
      .from('products')
      .select('ProductID')
      .eq('ProductID', id)
      .limit(1)
    if (error) throw new Error(error.message)
    return Array.isArray(data) && data.length > 0
  },

  // Get low stock count (for badge) - ใช้ lowStockThreshold จาก settings เมื่อสินค้าไม่มี MinStock
  async getLowStockCount() {
    try {
      const { getNotificationsSettings } = await import('./shopSettingsService')
      const { lowStockThreshold } = await getNotificationsSettings()
      const defaultMin = Math.max(0, Number(lowStockThreshold) || 5)

      const { data, error } = await supabase
        .from('products')
        .select('Stock, MinStock, ProductID')

      if (error) {
        console.error('Error fetching products for low stock count:', error)
        throw error
      }

      if (!data || data.length === 0) {
        console.log('No products found for low stock count')
        return 0
      }

      const lowStockCount = data.filter(p => {
        const stock = Number(p.Stock || p.stock || 0) || 0
        const minStock = Number(p.MinStock ?? p.minStock ?? p.min_stock ?? defaultMin) || defaultMin
        return stock <= minStock
      }).length

      console.log(`[Low Stock Count] Found ${lowStockCount} products with low stock out of ${data.length} total products`)
      return lowStockCount
    } catch (error) {
      console.error('Error getting low stock count:', error)
      return 0
    }
  },

  // Update product — รองรับการแก้ไขรหัสสินค้า (ProductID) โดยอัปเดต franchise_stock และ franchise_stock_logs ด้วย
  async updateProduct(productId, updates) {
    const newProductId = (updates.id || '').trim()
    const isChangingId = newProductId && newProductId !== productId

    if (isChangingId) {
      const exists = await this.isProductIdExists(newProductId)
      if (exists) {
        throw new Error(`รหัสสินค้า "${newProductId}" มีอยู่แล้ว กรุณาใช้รหัสอื่น`)
      }
    }

    const updateData = {
      ProductName: updates.name,
      Price: updates.price,
      Stock: updates.stock,
      Image: updates.image,
      Category: updates.category,
      Detail: updates.detail,
      Supplier: updates.supplier,
      Unit: updates.unit,
      Weight: updates.weight,
      MinStock: updates.minStock,
      FranchisePrice: updates.franchisePrice,
      OrderStep: Math.max(1, parseInt(updates.orderStep, 10) || 1)
    }
    if (updates.shopHidden !== undefined) {
      updateData.ShopHidden = updates.shopHidden === true
    }
    if (updates.visibleUserTypes !== undefined) {
      updateData.VisibleUserTypes = Array.isArray(updates.visibleUserTypes)
        ? updates.visibleUserTypes
        : ['regular', 'franchise']
    }
    if (updates.saleRestrictedToUsers !== undefined) {
      updateData.SaleRestrictedToUsers = updates.saleRestrictedToUsers === true
    }
    if (updates.allowedViewerEmails !== undefined || updates.allowedViewerEmailsText !== undefined) {
      updateData.AllowedViewerEmails = serializeAllowedViewerEmailsToJson(
        updates.allowedViewerEmails !== undefined ? updates.allowedViewerEmails : updates.allowedViewerEmailsText
      )
    }
    if (updates.productOptions !== undefined) {
      updateData.ProductOptions = sanitizeProductOptionsForDb(updates.productOptions)
    }
    if (updates.isBundle !== undefined) {
      updateData.IsBundle = updates.isBundle === true
    }
    if (updates.bundleFlexible !== undefined) {
      updateData.BundleFlexible = updates.bundleFlexible === true
    }
    if (updates.bundlePrimaryProductId !== undefined) {
      updateData.BundlePrimaryProductId = updates.bundlePrimaryProductId || null
    }
    if (updates.bundleLines !== undefined) {
      updateData.BundleLines = Array.isArray(updates.bundleLines) ? updates.bundleLines : []
    }
    if (updates.bundleComponentSumEqualsPrimary !== undefined) {
      updateData.BundleComponentSumEqualsPrimary = updates.bundleComponentSumEqualsPrimary === true
    }
    if (updates.franchiseAvailable !== undefined) {
      updateData.FranchiseAvailable = updates.franchiseAvailable === true
    }
    if (isChangingId) {
      updateData.ProductID = newProductId
    }
    if (updates.cost !== undefined && updates.cost !== null && updates.cost !== '') {
      updateData.Cost = Number(updates.cost)
    }
    if (updates.priceTiers !== undefined) {
      updateData.PriceTiers = sanitizePriceTiersForDb(updates.priceTiers)
    }

    const { error } = await supabase
      .from('products')
      .update(updateData)
      .eq('ProductID', productId)

    if (error) {
      throw new Error(error.message)
    }

    if (isChangingId) {
      await supabase.from('franchise_stock').update({ productid: newProductId }).eq('productid', productId)
      await supabase.from('franchise_stock_logs').update({ productid: newProductId }).eq('productid', productId)
      await supabase.from('promotions').update({ ProductID: newProductId }).eq('ProductID', productId)
      await supabase.from('promotions').update({ GetProductID: newProductId }).eq('GetProductID', productId)
      await supabase.from('po_items').update({ productid: newProductId }).eq('productid', productId)
      await supabase.from('stock_logs').update({ productid: newProductId }).eq('productid', productId)
    }

    const updated = await this.getProduct(isChangingId ? newProductId : productId)
    if (!updated) {
      throw new Error('ไม่พบสินค้าหลังอัปเดต หรือไม่มีสิทธิ์อ่าน')
    }
    return updated
  },

  // Add product
  async addProduct(productData) {
    const productId = (productData.id || '').trim() || `PROD_${Date.now()}`
    const exists = await this.isProductIdExists(productId)
    if (exists) {
      throw new Error(`รหัสสินค้า "${productId}" มีอยู่แล้วในระบบ กรุณาใช้รหัสอื่น`)
    }
    const insertData = {
      ProductID: productId,
      ProductName: productData.name,
      Price: productData.price,
      Stock: productData.stock || 0,
      Image: productData.image || '',
      Category: productData.category || '',
      Detail: productData.detail || '',
      Supplier: productData.supplier || '',
      Unit: productData.unit || 'ชิ้น',
      Weight: productData.weight || 0,
      MinStock: productData.minStock || 5,
      FranchisePrice: productData.franchisePrice || productData.price,
      OrderStep: Math.max(1, parseInt(productData.orderStep, 10) || 1),
      ShopHidden: productData.shopHidden === true,
      VisibleUserTypes: Array.isArray(productData.visibleUserTypes)
        ? productData.visibleUserTypes
        : ['regular', 'franchise'],
      FranchiseAvailable: productData.franchiseAvailable !== false,
      SaleRestrictedToUsers: productData.saleRestrictedToUsers === true,
      AllowedViewerEmails: serializeAllowedViewerEmailsToJson(
        productData.allowedViewerEmails !== undefined ? productData.allowedViewerEmails : productData.allowedViewerEmailsText
      ),
      ProductOptions: sanitizeProductOptionsForDb(productData.productOptions),
      IsBundle: productData.isBundle === true,
      BundleFlexible: productData.bundleFlexible === true,
      BundlePrimaryProductId: productData.bundlePrimaryProductId || null,
      BundleLines: Array.isArray(productData.bundleLines) ? productData.bundleLines : [],
      BundleComponentSumEqualsPrimary: productData.bundleComponentSumEqualsPrimary === true,
      PriceTiers: sanitizePriceTiersForDb(productData.priceTiers)
    }
    
    // Add Cost if provided
    if (productData.cost !== undefined && productData.cost !== null && productData.cost !== '') {
      insertData.Cost = Number(productData.cost)
    }

    const { error } = await supabase
      .from('products')
      .insert(insertData)

    if (error) {
      throw new Error(error.message)
    }

    const created = await this.getProduct(insertData.ProductID)
    if (!created) {
      throw new Error('สร้างสินค้าแล้วแต่ไม่สามารถอ่านข้อมูลได้ (ตรวจสอบ RLS หรือสิทธิ์ตาราง products)')
    }
    return created
  },

  // Bulk add products from CSV rows
  async bulkInsertProducts(productRows) {
    if (!Array.isArray(productRows) || productRows.length === 0) {
      throw new Error('ไม่พบข้อมูลสินค้าที่จะนำเข้า')
    }

    const normalizedRows = productRows.map((row, idx) => {
      const productId = String(row.id || '').trim() || `PROD_${Date.now()}_${idx + 1}`
      return {
        ProductID: productId,
        ProductName: String(row.name || '').trim(),
        Price: Number(row.price || 0),
        Stock: Math.max(0, Number(row.stock || 0)),
        Image: String(row.image || '').trim(),
        Category: String(row.category || '').trim(),
        Detail: String(row.detail || '').trim(),
        Supplier: String(row.supplier || '').trim(),
        Unit: String(row.unit || '').trim() || 'ชิ้น',
        Weight: Math.max(0, Number(row.weight || 0)),
        MinStock: Math.max(0, Number(row.minStock || 5)),
        FranchisePrice: Number(row.franchisePrice || row.price || 0),
        Cost: row.cost !== undefined && row.cost !== null && row.cost !== '' ? Number(row.cost) : undefined,
        OrderStep: Math.max(1, parseInt(row.orderStep, 10) || 1),
        ShopHidden: row.shopHidden === true,
        VisibleUserTypes: Array.isArray(row.visibleUserTypes) && row.visibleUserTypes.length > 0
          ? row.visibleUserTypes
          : ['regular', 'franchise'],
        FranchiseAvailable: row.franchiseAvailable !== false,
        SaleRestrictedToUsers: row.saleRestrictedToUsers === true,
        AllowedViewerEmails: serializeAllowedViewerEmailsToJson(
          row.allowedViewerEmails !== undefined ? row.allowedViewerEmails : row.allowedViewerEmailsText
        ),
        ProductOptions: sanitizeProductOptionsForDb(row.productOptions),
        IsBundle: row.isBundle === true,
        BundleFlexible: row.bundleFlexible === true,
        BundlePrimaryProductId: row.bundlePrimaryProductId || null,
        BundleLines: Array.isArray(row.bundleLines) ? row.bundleLines : [],
        BundleComponentSumEqualsPrimary: row.bundleComponentSumEqualsPrimary === true,
        PriceTiers: sanitizePriceTiersForDb(row.priceTiers)
      }
    })

    const invalidName = normalizedRows.find((row) => !row.ProductName)
    if (invalidName) {
      throw new Error(`พบแถวที่ไม่มีชื่อสินค้า (รหัส: ${invalidName.ProductID})`)
    }
    const invalidPrice = normalizedRows.find((row) => !Number.isFinite(row.Price) || row.Price < 0)
    if (invalidPrice) {
      throw new Error(`พบราคาไม่ถูกต้อง (รหัส: ${invalidPrice.ProductID})`)
    }

    const seenIds = new Set()
    const duplicateInFile = normalizedRows.find((row) => {
      const key = row.ProductID.toLowerCase()
      if (seenIds.has(key)) return true
      seenIds.add(key)
      return false
    })
    if (duplicateInFile) {
      throw new Error(`พบรหัสสินค้าซ้ำในไฟล์ CSV: ${duplicateInFile.ProductID}`)
    }

    const inputIds = normalizedRows.map((row) => row.ProductID)
    const { data: existingRows, error: existingErr } = await supabase
      .from('products')
      .select('ProductID')
      .in('ProductID', inputIds)
    if (existingErr) throw new Error(existingErr.message)
    if (Array.isArray(existingRows) && existingRows.length > 0) {
      const existing = existingRows.map((x) => x.ProductID).join(', ')
      throw new Error(`รหัสสินค้ามีอยู่แล้วในระบบ: ${existing}`)
    }

    const insertPayload = normalizedRows.map((row) => {
      const out = { ...row }
      if (out.Cost === undefined) delete out.Cost
      return out
    })

    const batchSize = 200
    for (let i = 0; i < insertPayload.length; i += batchSize) {
      const chunk = insertPayload.slice(i, i + batchSize)
      const { error } = await supabase
        .from('products')
        .insert(chunk)
      if (error) throw new Error(error.message)
    }

    return { insertedCount: insertPayload.length, insertedIds: inputIds }
  },

  // Delete product
  async deleteProduct(productId) {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('ProductID', productId)

      if (error) {
        throw new Error(error.message)
      }

      return { success: true }
    } catch (error) {
      console.error('Error deleting product:', error)
      throw new Error(error.message || 'ไม่สามารถลบสินค้าได้')
    }
  },

  // Update stock with optional logging
  async updateStock(productId, newStock, userEmail = 'system', logType = 'EDIT', logNote = 'แก้ไขสต็อก') {
    // Get current product info for logging
    const { data: currentList, error: fetchError } = await supabase
      .from('products')
      .select('ProductName, Stock, Unit')
      .eq('ProductID', productId)
      .limit(1)

    if (fetchError) {
      throw new Error(fetchError.message)
    }
    const currentProduct = Array.isArray(currentList) && currentList.length > 0 ? currentList[0] : null
    if (!currentProduct) {
      throw new Error('Product not found for stock update.')
    }

    const oldStock = Number(currentProduct.Stock) || 0
    const quantityChange = newStock - oldStock

    console.log('[productService] Preparing to update stock:', {
      productId,
      productName: currentProduct.ProductName,
      oldStock,
      newStock,
      quantityChange,
      logType,
      logNote
    })

    // Determine log type and quantity based on stock change direction
    // If stock decreased (quantityChange < 0), it's OUT (sale/withdrawal)
    // If stock increased (quantityChange > 0), it's IN (restock/receive)
    let finalLogType = logType
    let finalQuantity = quantityChange
    
    // Auto-detect type if not explicitly set
    if (logType === 'EDIT' || !logType) {
      if (quantityChange < 0) {
        finalLogType = 'OUT'
        finalQuantity = Math.abs(quantityChange) // Store as positive, display as negative
      } else if (quantityChange > 0) {
        finalLogType = 'IN'
        finalQuantity = quantityChange
      } else {
        finalLogType = 'EDIT'
        finalQuantity = 0
      }
    } else if (logType === 'OUT' && quantityChange < 0) {
      // If explicitly OUT and quantityChange is negative, use absolute value
      finalQuantity = Math.abs(quantityChange)
    }

    // Update stock (ไม่ใช้ .select() เพื่อหลีกเลี่ยง 406 เมื่อ RLS ไม่ให้คืนแถว)
    const { error } = await supabase
      .from('products')
      .update({ Stock: newStock })
      .eq('ProductID', productId)

    if (error) {
      console.error('[productService] ✗ Error updating products table:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        productId,
        newStock
      })
      throw new Error(`ไม่สามารถอัปเดตสต็อก: ${error.message}`)
    }

    console.log('[productService] ✓ Stock updated in products table:', { productId, oldStock, newStock })

    // Log stock movement if quantity changed
    if (quantityChange !== 0) {
      try {
        const logData = {
          productid: productId,
          productname: currentProduct.ProductName,
          type: finalLogType,
          quantity: finalQuantity, // Store as positive for OUT, will be displayed as negative
          balance: newStock,
          note: logNote || 'แก้ไขสต็อก',
          useremail: userEmail || 'system'
        }
        
        console.log('[productService] Attempting to log stock movement:', logData)
        
        const { data: insertedData, error: logError } = await supabase
          .from('stock_logs')
          .insert(logData)
          .select()
        
        if (logError) {
          console.error('[productService] ✗ Error logging stock movement:', {
            error: logError,
            code: logError.code,
            message: logError.message,
            details: logError.details,
            hint: logError.hint,
            logData
          })
          // Don't throw error, just log it - stock update should still succeed
        } else {
          console.log('[productService] ✓ Stock log saved successfully:', insertedData)
        }
      } catch (logError) {
        console.error('[productService] ✗ Exception logging stock movement:', {
          error: logError,
          message: logError.message,
          stack: logError.stack
        })
        // Don't throw error, just log it
      }
    } else {
      console.log('[productService] No stock change (quantityChange = 0), skipping log')
    }

    // Dispatch event to notify stock update
    window.dispatchEvent(new CustomEvent('stockUpdated', {
      detail: { productId, newStock }
    }))

    const updated = await this.getProduct(productId)
    return updated || { id: productId, name: currentProduct?.ProductName, stock: newStock }
  }
}
