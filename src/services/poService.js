import { supabase } from '../utils/supabase'

export const poService = {
  // Create PO
  async createPO(poData, userEmail, user = null) {
    try {
      const poId = `PO-${Date.now().toString().slice(-8)}`
      const totalAmount = poData.items.reduce((sum, item) => sum + (Number(item.price || 0) * (item.qty || 0)), 0)

      // Check if this is a franchise PO
      const isFranchise = poData.isFranchise || (user?.userType === 'franchise' || user?.customerType === 'franchise')
      const branchId = poData.branchId || user?.branchId || null
      const isOtherSupplier = !!poData.isOtherSupplier // PO สินค้าซัพนอก = พิมพ์บิลซื้อเอง ไม่ไปชำระเงิน

      // Insert PO header
      const insertData = {
        poid: poId,
        supplier: poData.supplier || '',
        status: isFranchise ? 'รอส่งออเดอร์' : 'รออนุมัติ', // Franchise PO starts as 'รอส่งออเดอร์'
        totalamount: totalAmount,
        createdby: userEmail,
        expecteddate: poData.expectedDate || null,
        notes: poData.notes || '',
        isfranchise: isFranchise,
        is_other_supplier: isOtherSupplier
      }

      if (isFranchise && branchId) {
        insertData.branchid = branchId
      }

      const { data: poHeader, error: poError } = await supabase
        .from('purchase_orders')
        .insert(insertData)
        .select()
        .single()

      if (poError) throw poError

      // Insert PO items
      const items = poData.items.map(item => ({
        poid: poId,
        productid: item.productId || item.id || '',
        productname: item.productName || item.name || '',
        qtyordered: item.qty || 0,
        priceperunit: Number(item.price || 0),
        subtotal: Number(item.price || 0) * (item.qty || 0)
      }))

      const { error: itemsError } = await supabase
        .from('po_items')
        .insert(items)

      if (itemsError) throw itemsError

      return { success: true, poId }
    } catch (error) {
      console.error('Error creating PO:', error)
      throw new Error(error.message || 'ไม่สามารถสร้าง PO ได้')
    }
  },

  // Create Franchise PO (wrapper for createPO with franchise settings)
  async createFranchisePO(poData, userEmail, branchId) {
    return this.createPO({
      ...poData,
      isFranchise: true,
      branchId: branchId
    }, userEmail, { userType: 'franchise', branchId: branchId })
  },

  // Convert Franchise PO to Order (send to admin)
  async convertPOToOrder(poId, userEmail, user) {
    try {
      // Get PO details
      const po = await this.getPO(poId)
      if (!po) {
        throw new Error('ไม่พบข้อมูล PO')
      }

      if (po.status !== 'รอส่งออเดอร์') {
        throw new Error('PO นี้ไม่สามารถส่งออเดอร์ได้ (สถานะไม่ถูกต้อง)')
      }

      // Get products from main stock to check availability
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('ProductID, ProductName, Stock, Price, FranchisePrice, Supplier, Unit')

      if (productsError) throw productsError

      const productsMap = new Map()
      products.forEach(p => {
        productsMap.set(p.ProductID, p)
      })

      // Validate stock availability and prepare order items
      const orderItems = []
      let totalAmount = 0

      for (const item of po.items || []) {
        const product = productsMap.get(item.productid)
        if (!product) {
          throw new Error(`ไม่พบสินค้า: ${item.productname}`)
        }

        const requestedQty = item.qtyordered || 0
        const availableStock = Number(product.Stock) || 0

        if (requestedQty > availableStock) {
          throw new Error(`สินค้า ${item.productname} มีสต็อกไม่พอ (ต้องการ: ${requestedQty}, มี: ${availableStock})`)
        }

        // Use FranchisePrice if available, otherwise use Price
        const price = Number(product.FranchisePrice) || Number(product.Price) || 0
        const subtotal = price * requestedQty
        totalAmount += subtotal

        orderItems.push({
          productId: item.productid,
          productName: item.productname,
          qty: requestedQty,
          price: price,
          unit: product.Unit || 'ชิ้น'
        })
      }

      if (orderItems.length === 0) {
        throw new Error('ไม่มีรายการสินค้าใน PO')
      }

      // Create order
      const orderId = `ORD${Date.now()}${Math.random().toString(36).substring(2, 7).toUpperCase()}`
      
      // Insert order items
      // Column names must match Supabase exactly - same as orderService.placeOrder
      const orderRows = orderItems.map(item => ({
        OrderID: orderId,
        UserEmail: userEmail,
        Username: user?.name || user?.email || '',
        Itemname: item.productName, // Use Itemname (lowercase n) to match database schema
        Qty: item.qty,
        Price: item.price,
        Total: totalAmount,
        Status: 'รอตรวจสอบ',
        SlipURL: null, // Will be set in checkout
        Address: user?.address || '',
        TrackingNo: null, // Will be set after shipping
        Timestamp: new Date().toISOString(),
        Discount: 0, // int8 - no discount for PO orders initially
        'Shipping Cost': 0, // Column name has space - will be set in checkout
        Weight: 0, // Will be calculated in checkout
        ShippingMethod: 'pending', // Will be set in checkout
        PaymentMethod: 'pending' // Will be set in checkout
      }))

      const { error: orderError } = await supabase
        .from('order')
        .insert(orderRows)

      if (orderError) throw orderError

      // Update PO status to 'รอชำระเงิน'
      await this.updatePOStatus(poId, 'รอชำระเงิน')

      return {
        success: true,
        orderId,
        orderItems,
        totalAmount
      }
    } catch (error) {
      console.error('Error converting PO to order:', error)
      throw new Error(error.message || 'ไม่สามารถส่งออเดอร์ได้')
    }
  },

  // Get all POs
  async getAllPOs(user) {
    try {
      let query = supabase
        .from('purchase_orders')
        .select('*')
        .order('createddate', { ascending: false })

      // Filter by franchise if needed
      if (user?.role !== 'admin' && user?.customerType === 'franchise' && user?.branchId) {
        query = query.eq('branchid', user.branchId).eq('isfranchise', true)
      } else if (user?.role === 'admin') {
        // Admin can see all POs, but filter out franchise POs if needed
        query = query.eq('isfranchise', false)
      } else {
        // Regular users should not see POs
        return []
      }

      const { data, error } = await query

      if (error) throw error

      // Get items for each PO
      const posWithItems = await Promise.all(
        (data || []).map(async (po) => {
          const { data: items, error: itemsError } = await supabase
            .from('po_items')
            .select('*')
            .eq('poid', po.poid)
            .order('id', { ascending: true })

          if (itemsError) {
            console.error('Error fetching PO items:', itemsError)
            return { ...po, items: [] }
          }

          return {
            ...po,
            items: items || []
          }
        })
      )

      return posWithItems
    } catch (error) {
      console.error('Error fetching POs:', error)
      throw new Error(error.message || 'ไม่สามารถดึงข้อมูล PO ได้')
    }
  },

  // Get single PO
  async getPO(poId) {
    try {
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('poid', poId)
        .maybeSingle()

      if (poError) throw poError
      if (!po) return null

      const { data: items, error: itemsError } = await supabase
        .from('po_items')
        .select('*')
        .eq('poid', poId)
        .order('id', { ascending: true })

      if (itemsError) throw itemsError

      return {
        ...po,
        items: items || []
      }
    } catch (error) {
      console.error('Error fetching PO:', error)
      throw new Error(error.message || 'ไม่สามารถดึงข้อมูล PO ได้')
    }
  },

  /**
   * ยกเลิก PO (แสดงเป็นลบรายการที่ยังไม่ได้กดรับ) — เฉพาะ PO ที่ยังไม่ได้รับเท่านั้น
   */
  async cancelPO(poId) {
    const po = await this.getPO(poId)
    if (!po) throw new Error('ไม่พบ PO')
    const status = (po.status || po.Status || '').toString()
    if (status === 'รับแล้ว') {
      throw new Error('ไม่สามารถลบ PO ที่รับสินค้าแล้วได้')
    }
    if (status === 'ยกเลิก') {
      throw new Error('PO นี้ถูกยกเลิกไปแล้ว')
    }
    await this.updatePOStatus(poId, 'ยกเลิก')
    return { success: true }
  },

  // Update PO status
  async updatePOStatus(poId, status) {
    try {
      const updateData = {
        status,
        updatedat: new Date().toISOString()
      }

      if (status === 'รับแล้ว') {
        updateData.receiveddate = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('purchase_orders')
        .update(updateData)
        .eq('poid', poId)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error updating PO status:', error)
      throw new Error(error.message || 'ไม่สามารถอัปเดตสถานะ PO ได้')
    }
  },

  // Receive PO (update stock) - รองรับการรับบางส่วน
  async receivePO(poId, receivedItems, userEmail) {
    try {
      console.log('[poService] ===== receivePO START =====')
      console.log('[poService] Parameters:', {
        poId,
        receivedItemsCount: receivedItems?.length,
        receivedItems,
        userEmail
      })

      // Get PO with items
      const po = await this.getPO(poId)
      if (!po) {
        console.error('[poService] ✗ PO not found:', poId)
        throw new Error('ไม่พบ PO')
      }

      console.log('[poService] PO retrieved:', {
        poId: po.poid,
        itemsCount: po.items?.length,
        items: po.items?.map(item => ({
          id: item.id,
          productid: item.productid,
          productname: item.productname,
          qtyordered: item.qtyordered,
          receivedqty: item.receivedqty
        }))
      })

      if (!receivedItems || receivedItems.length === 0) {
        console.error('[poService] ✗ No received items provided')
        throw new Error('กรุณาระบุจำนวนสินค้าที่ได้รับ')
      }

      const { productService } = await import('./productService')
      const receivedItemMap = {}
      receivedItems.forEach(item => {
        // Handle both productId (camelCase) and productid (lowercase)
        const pid = item.productId || item.productid
        const qty = item.receivedQty || item.receivedqty || 0
        receivedItemMap[pid] = qty
        console.log('[poService] Mapping received item:', { pid, qty, fullItem: item })
      })

      console.log('[poService] Received items map created:', receivedItemMap)

      let allReceived = true
      let hasReceived = false
      const itemsToUpdate = []

      // Update stock and po_items for received items
      console.log('[poService] Starting to process received items:', {
        poId,
        itemsCount: po.items.length,
        receivedItemMap
      })

      for (const item of po.items) {
        const receivedQty = receivedItemMap[item.productid] || 0
        const currentReceivedQty = Number(item.receivedqty || 0)
        const newReceivedQty = currentReceivedQty + receivedQty
        
        console.log('[poService] Processing item:', {
          productId: item.productid,
          productName: item.productname,
          receivedQty,
          currentReceivedQty,
          newReceivedQty,
          qtyordered: item.qtyordered
        })
        
        // Update po_items table
        if (receivedQty > 0) {
          hasReceived = true
          itemsToUpdate.push({
            id: item.id,
            receivedqty: newReceivedQty,
            status: newReceivedQty >= item.qtyordered ? 'received' : 'partially_received'
          })
          
          // Get current stock and product info
          console.log('[poService] Fetching product info for:', item.productid)
          const { data: product, error: productError } = await supabase
            .from('products')
            .select('Stock, Unit, ProductName')
            .eq('ProductID', item.productid)
            .maybeSingle()

          if (productError) {
            console.error('[poService] Error fetching product:', productError)
            throw new Error(`ไม่สามารถดึงข้อมูลสินค้า ${item.productid}: ${productError.message}`)
          }

          if (product) {
            const currentStock = Number(product.Stock) || 0
            const newStock = currentStock + receivedQty
            
            console.log('[poService] Product found, updating stock:', {
              productId: item.productid,
              productName: product.ProductName || item.productname,
              currentStock,
              receivedQty,
              newStock,
              userEmail: userEmail || po.createdby
            })
            
            // Update stock with logging
            try {
              await productService.updateStock(
                item.productid, 
                newStock, 
                userEmail || po.createdby,
                currentStock === 0 ? 'ADD' : 'IN',
                `รับสินค้าจาก PO: ${poId} (รับ ${receivedQty}${product.Unit ? ' ' + product.Unit : ''} จาก ${item.qtyordered}${product.Unit ? ' ' + product.Unit : ''})`
              )
              
              console.log('[poService] ✓ Stock updated successfully:', item.productid, 'New stock:', newStock)
            } catch (stockError) {
              console.error('[poService] ✗ Error updating stock:', {
                productId: item.productid,
                productName: item.productname,
                error: stockError.message,
                stack: stockError.stack
              })
              throw new Error(`ไม่สามารถอัปเดตสต็อกสำหรับ ${item.productname}: ${stockError.message}`)
            }
          } else {
            console.warn('[poService] ✗ Product not found in database:', item.productid)
            throw new Error(`ไม่พบสินค้า ${item.productid} ในระบบ`)
          }
        }

        // Check if all items are fully received
        if (newReceivedQty < item.qtyordered) {
          allReceived = false
        }
      }

      console.log('[poService] Finished processing items:', {
        hasReceived,
        allReceived,
        itemsToUpdateCount: itemsToUpdate.length
      })

      if (!hasReceived) {
        throw new Error('กรุณาระบุจำนวนสินค้าที่ได้รับอย่างน้อย 1 รายการ')
      }

      // Update po_items table
      if (itemsToUpdate.length > 0) {
        console.log('[poService] Updating po_items:', itemsToUpdate)
        for (const updateItem of itemsToUpdate) {
          const updateData = {
            receivedqty: updateItem.receivedqty
          }
          
          // Only update status if column exists (handle gracefully)
          if (updateItem.status) {
            updateData.status = updateItem.status
          }
          
          console.log('[poService] Updating po_item id:', updateItem.id, 'with data:', updateData)
          
          const { data: updatedData, error: updateError } = await supabase
            .from('po_items')
            .update(updateData)
            .eq('id', updateItem.id)
            .select()

          if (updateError) {
            console.error('[poService] ✗ Error updating po_items:', {
              error: updateError,
              code: updateError.code,
              message: updateError.message,
              details: updateError.details,
              hint: updateError.hint,
              updateItem,
              updateData
            })
            // Don't throw error, just log it - stock update should still succeed
          } else {
            console.log('[poService] ✓ po_item updated successfully:', updatedData)
          }
        }
      }

      // Update PO status
      if (allReceived) {
        // All items received, mark PO as complete
        await this.updatePOStatus(poId, 'รับแล้ว')
        return { success: true, allReceived: true }
      } else {
        // Partial receive, update status to indicate partial receipt
        await this.updatePOStatus(poId, 'รับบางส่วน')
        return { success: true, partial: true }
      }
    } catch (error) {
      console.error('Error receiving PO:', error)
      throw new Error(error.message || 'ไม่สามารถรับ PO ได้')
    }
  },

  // Receive PO สำหรับแฟรนไชส์ (สินค้าซัพนอก) — อัปเดต franchise_stock และ po_items เท่านั้น
  async receivePOFranchise(poId, receivedItems, branchId, userEmail) {
    try {
      const po = await this.getPO(poId)
      if (!po) throw new Error('ไม่พบ PO')
      if (!po.isfranchise || (po.branchid && po.branchid !== branchId)) {
        throw new Error('PO นี้ไม่ใช่ของสาขานี้หรือไม่สามารถรับได้')
      }

      if (!receivedItems || receivedItems.length === 0) {
        throw new Error('กรุณาระบุจำนวนสินค้าที่ได้รับ')
      }

      const receivedItemMap = {}
      receivedItems.forEach(item => {
        const pid = item.productId || item.productid
        const qty = item.receivedQty || item.receivedqty || 0
        receivedItemMap[pid] = qty
      })

      const { franchiseStockService } = await import('./franchiseStockService')
      let allReceived = true
      let hasReceived = false
      const itemsToUpdate = []

      for (const item of po.items) {
        const receivedQty = receivedItemMap[item.productid] || 0
        const currentReceivedQty = Number(item.receivedqty || 0)
        const newReceivedQty = currentReceivedQty + receivedQty

        if (receivedQty > 0) {
          hasReceived = true
          itemsToUpdate.push({
            id: item.id,
            receivedqty: newReceivedQty,
            status: newReceivedQty >= item.qtyordered ? 'received' : 'partially_received'
          })

          const note = `รับจาก PO: ${poId} (รับ ${receivedQty} จาก ${item.qtyordered})`
          const isOtherSupplier = !!(po.is_other_supplier ?? po.isothersupplier)
          await franchiseStockService.stockInWithType(
            branchId,
            String(item.productid).trim(),
            receivedQty,
            note,
            userEmail,
            'IN',
            null,
            poId,
            (item.productname || '').toString().trim() || null,
            isOtherSupplier
          )
        }
        if (newReceivedQty < item.qtyordered) allReceived = false
      }

      if (!hasReceived) {
        throw new Error('กรุณาระบุจำนวนสินค้าที่ได้รับอย่างน้อย 1 รายการ')
      }

      for (const updateItem of itemsToUpdate) {
        const updateData = { receivedqty: updateItem.receivedqty }
        if (updateItem.status) updateData.status = updateItem.status
        await supabase.from('po_items').update(updateData).eq('id', updateItem.id)
      }

      if (allReceived) {
        await this.updatePOStatus(poId, 'รับแล้ว')
        return { success: true, allReceived: true }
      } else {
        await this.updatePOStatus(poId, 'รับบางส่วน')
        return { success: true, partial: true }
      }
    } catch (error) {
      console.error('Error receiving PO (franchise):', error)
      throw new Error(error.message || 'ไม่สามารถรับ PO ได้')
    }
  },

  // Cancel remaining items in PO
  async cancelRemainingItems(poId, cancelledItems, note, userEmail) {
    try {
      const po = await this.getPO(poId)
      if (!po) throw new Error('ไม่พบ PO')

      if (!cancelledItems || cancelledItems.length === 0) {
        throw new Error('ไม่มีสินค้าที่ต้องยกเลิก')
      }

      const itemsToUpdate = []
      let allCancelled = true

      // Update po_items - mark cancelled items
      for (const cancelledItem of cancelledItems) {
        const poItem = po.items.find(item => 
          item.productid === (cancelledItem.productId || cancelledItem.productid)
        )

        if (poItem) {
          const currentCancelledQty = Number(poItem.cancelledqty || 0)
          const remainingQty = poItem.qtyordered - (Number(poItem.receivedqty || 0) + currentCancelledQty)
          
          if (remainingQty > 0) {
            itemsToUpdate.push({
              id: poItem.id,
              cancelledqty: currentCancelledQty + remainingQty,
              cancelreason: note || 'ยกเลิกโดยผู้ใช้',
              status: 'cancelled'
            })
          }

          // Check if all items are cancelled
          const totalHandled = (Number(poItem.receivedqty || 0) + Number(poItem.cancelledqty || 0) + remainingQty)
          if (totalHandled < poItem.qtyordered) {
            allCancelled = false
          }
        }
      }

      // Update po_items table
      if (itemsToUpdate.length > 0) {
        for (const updateItem of itemsToUpdate) {
          const { error: updateError } = await supabase
            .from('po_items')
            .update({
              cancelledqty: updateItem.cancelledqty,
              cancelreason: updateItem.cancelreason,
              status: updateItem.status
            })
            .eq('id', updateItem.id)

          if (updateError) {
            console.error('Error updating po_items for cancellation:', updateError)
          }
        }
      }

      // Update PO status if all items are cancelled
      if (allCancelled) {
        await this.updatePOStatus(poId, 'ยกเลิก')
      } else {
        // Partial cancellation, keep current status or update to indicate partial cancellation
        await this.updatePOStatus(poId, 'ยกเลิกบางส่วน')
      }
      
      return { success: true }
    } catch (error) {
      console.error('Error cancelling remaining items:', error)
      throw new Error(error.message || 'ไม่สามารถยกเลิกสินค้าที่เหลือได้')
    }
  },

  // Log stock movement
  async logStockMovement({ productId, productName, type, quantity, balance, note, userEmail, poId }) {
    try {
      const { error } = await supabase
        .from('stock_logs')
        .insert({
          productid: productId,
          productname: productName,
          type: type, // 'IN', 'OUT', 'ADD', 'EDIT', 'ADJUST'
          quantity: quantity,
          balance: balance,
          note: note || '',
          useremail: userEmail || '',
          poid: poId || null
        })

      if (error) {
        console.error('Error logging stock movement:', error)
        // Don't throw error, just log it
      }
    } catch (error) {
      console.error('Error logging stock movement:', error)
      // Don't throw error, just log it
    }
  },

  // Create Franchise PO
  async createFranchisePO(poData, userEmail, branchId) {
    try {
      const poId = `FPO-${Date.now().toString().slice(-8)}`
      const totalAmount = poData.items.reduce((sum, item) => sum + (Number(item.price || 0) * (item.qty || 0)), 0)

      // Insert PO header
      const { data: poHeader, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          poid: poId,
          supplier: poData.supplier || '',
          status: 'รออนุมัติ',
          totalamount: totalAmount,
          createdby: userEmail,
          expecteddate: poData.expectedDate || null,
          notes: poData.notes || '',
          isfranchise: true,
          branchid: branchId || ''
        })
        .select()
        .single()

      if (poError) throw poError

      // Insert PO items
      const items = poData.items.map(item => ({
        poid: poId,
        productid: item.productId || item.id || '',
        productname: item.productName || item.name || '',
        qtyordered: item.qty || 0,
        priceperunit: Number(item.price || 0),
        subtotal: Number(item.price || 0) * (item.qty || 0)
      }))

      const { error: itemsError } = await supabase
        .from('po_items')
        .insert(items)

      if (itemsError) throw itemsError

      return { success: true, poId }
    } catch (error) {
      console.error('Error creating Franchise PO:', error)
      throw new Error(error.message || 'ไม่สามารถสร้าง PO ได้')
    }
  }
}
