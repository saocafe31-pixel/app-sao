/**
 * orderService – บริการดึง/อัปเดตออเดอร์
 * ตาราง order เก็บทีละแถวต่อรายการ (หนึ่งออเดอร์มีหลายแถว) จึงต้อง group ตาม OrderID ก่อนส่งกลับ
 * ดึง ProductID จากตาราง products แมตช์กับชื่อสินค้า เพื่อให้แสกน QR (ที่ encode ProductID) ใช้ได้ในหน้าแพ็ก
 */
import { supabase } from '../utils/supabase'
import { fetchUsernameByEmailMap } from '../utils/customerProfileLookup'
import { buildOrderLineItemName, orderItemNameFirstLine } from '../utils/orderLineItemDescription'
import { productService } from './productService'

/** สร้าง Map ชื่อสินค้า (trim) -> ProductID จากตาราง products */
async function buildProductNameToIdMap() {
  const { data: products, error } = await supabase
    .from('products')
    .select('ProductID, ProductName')
  if (error) {
    console.warn('[orderService] ไม่สามารถดึง products สำหรับแมป ProductID:', error.message)
    return new Map()
  }
  const map = new Map()
  ;(products || []).forEach((p) => {
    const id = p.ProductID ?? p.productid
    const name = (p.ProductName ?? p.productname ?? '').toString().trim()
    if (name && id) map.set(name, id)
  })
  return map
}

/** ปรับ orderId ให้เป็น string เดียวกันเวลาใช้เป็น key (ป้องกันแยกกลุ่มถ้า DB ส่ง casing ต่างกัน) */
function normalizeOrderId(value) {
  if (value == null) return ''
  return String(value).trim()
}

/** รวมกลุ่มออเดอร์จากแถวดิบของตาราง order (หลายแถวต่อหนึ่งออเดอร์) */
function buildOrdersFromRawRows (rawRows) {
  const ordersMap = new Map()
  ;(rawRows || []).forEach((row) => {
    const rawId = row.OrderID ?? row.orderid ?? row.order_id
    const orderId = normalizeOrderId(rawId)
    if (!orderId) return

    if (!ordersMap.has(orderId)) {
      ordersMap.set(orderId, {
        ID: orderId,
        OrderID: orderId,
        UserEmail: row.UserEmail || row.useremail,
        Username: row.Username || row.username,
        Total: row.Total || row.total || 0,
        Status: row.Status || row.status || 'รอตรวจสอบ',
        SlipURL: row.SlipURL || row.slipurl,
        Address: row.Address || row.address,
        TrackingNo: row.TrackingNo || row.trackingno || row.Tracking || row.tracking,
        Timestamp: row.Timestamp || row.timestamp || row.CreatedAt || row.created_at,
        Discount: row.Discount || row.discount || 0,
        DiscountInfo: row.DiscountInfo || row.discountinfo || row.Discount || row.discount || '',
        PromotionDiscount: row.PromotionDiscount || row.promotionDiscount || row.Promotion || row.promotion || 0,
        'Shipping Cost': row['Shipping Cost'] || row.ShippingCost || row.Shipping || row.shippingCost || row.shipping || 0,
        ShippingCost: row['Shipping Cost'] || row.ShippingCost || row.Shipping || row.shippingCost || row.shipping || 0,
        Weight: row.Weight || row.weight || 0,
        PaymentMethod: row.PaymentMethod || row.paymentmethod || 'transfer',
        ShippingMethod: row.ShippingMethod || row.shippingmethod || 'delivery',
        Subdistrict: row.Subdistrict || row.subdistrict || null,
        District: row.District || row.district || null,
        Province: row.Province || row.province || null,
        PostalCode: row.PostalCode || row.postalcode || null,
        RecipientPhone: row.RecipientPhone || row.recipientphone || null,
        Items: []
      })
    }

    const order = ordersMap.get(orderId)
    order.Items.push({
      id: row.ProductID || row.productid || null,
      name: row.Itemname || row.ItemName || row.itemname || row.item_name,
      qty: row.Qty || row.qty || 0,
      price: row.Price || row.price || 0
    })
  })

  return Array.from(ordersMap.values()).sort((a, b) => {
    const dateA = new Date(a.Timestamp || 0)
    const dateB = new Date(b.Timestamp || 0)
    return dateB - dateA
  })
}

/** รวมรายการออเดอร์จากการโหลดทีละช่วงแถว (กรณี OrderID เดียวกันข้ามช่วง) */
function mergeOrderPageLists (existing, incoming) {
  const itemKey = (it) => `${String(it.name || '').trim()}__${Number(it.price || 0)}`
  const m = new Map()
  const ingest = (list) => {
    for (const o of list || []) {
      const id = normalizeOrderId(o.ID || o.OrderID)
      if (!id) continue
      if (!m.has(id)) {
        m.set(id, { ...o, Items: [...(o.Items || [])] })
        continue
      }
      const cur = m.get(id)
      const seen = new Set((cur.Items || []).map(itemKey))
      for (const it of o.Items || []) {
        const k = itemKey(it)
        if (!seen.has(k)) {
          cur.Items.push({ ...it })
          seen.add(k)
        }
      }
    }
  }
  ingest(existing)
  ingest(incoming)
  return Array.from(m.values()).sort((a, b) => {
    const dateA = new Date(a.Timestamp || 0)
    const dateB = new Date(b.Timestamp || 0)
    return dateB - dateA
  })
}

/** ชื่อบรรทัดบนสุด: ใช้ Username จาก users ถ้ามี; ไม่งั้นใช้ snapshot จากแถว order ถ้าไม่ซ้ำอีเมล */
function computeCustomerDisplayName(order, profileUsername) {
  const email = String(order.UserEmail || order.User || '').trim()
  const emailLower = email.toLowerCase()
  const profile = String(profileUsername || '').trim()
  const snapshot = String(order.Username || '').trim()
  if (profile) return profile
  if (snapshot && snapshot.toLowerCase() !== emailLower) return snapshot
  return '—'
}

async function enrichOrdersWithCustomerDisplayNames(orders) {
  if (!orders || orders.length === 0) return orders
  const emails = orders.map((o) => o.UserEmail || o.User || '')
  const profileMap = await fetchUsernameByEmailMap(emails)
  for (const o of orders) {
    const email = String(o.UserEmail || o.User || '').trim()
    const key = email.toLowerCase()
    o.CustomerDisplayName = computeCustomerDisplayName(o, profileMap.get(key))
  }
  return orders
}

/** ใส่ item.id (ProductID) ให้แต่ละรายการใน order.Items โดยแมปจากชื่อสินค้าในตาราง products */
async function enrichOrderItemsWithProductId(orders) {
  if (!orders || !Array.isArray(orders) || orders.length === 0) return orders
  const nameToId = await buildProductNameToIdMap()
  if (nameToId.size === 0) return orders
  orders.forEach((order) => {
    if (!order.Items || !Array.isArray(order.Items)) return
    order.Items.forEach((item) => {
      if (item.id) return // มี ProductID จากตาราง order อยู่แล้ว
      const name = orderItemNameFirstLine(item.name ?? '')
      const productId = nameToId.get(name) || null
      if (productId) item.id = productId
    })
  })
  return orders
}

export const orderService = {
  /** ดึงออเดอร์ของ user ตามอีเมล (รองรับชื่อคอลัมน์หลายแบบ: UserEmail / useremail / User) */
  async getUserOrders(userEmail) {
    // ลองหลายรูปแบบชื่อคอลัมน์เพราะบางโปรเจกต์ใช้ตัวเล็ก/ตัวใหญ่ต่างกัน
    let { data, error } = await supabase
      .from('order')
      .select('*')
      .eq('UserEmail', userEmail)
      .order('Timestamp', { ascending: false })

    // If not found, try lowercase
    if (error || !data || data.length === 0) {
      const result = await supabase
        .from('order')
        .select('*')
        .eq('useremail', userEmail)
        .order('timestamp', { ascending: false })
      data = result.data
      error = result.error
    }

    // If still not found, try 'User' (fallback)
    if (error || !data || data.length === 0) {
      const result = await supabase
        .from('order')
        .select('*')
        .eq('User', userEmail)
        .order('CreatedAt', { ascending: false })
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('Error fetching user orders:', error)
      throw new Error(error.message || 'ไม่สามารถดึงข้อมูลออเดอร์ได้')
    }

    // Group orders by OrderID (since each item is a separate row)
    const ordersMap = new Map()
    const rawOrders = data || []
    
    rawOrders.forEach(row => {
      const rawId = row.OrderID ?? row.orderid ?? row.order_id
      const orderId = normalizeOrderId(rawId)
      if (!orderId) return

      if (!ordersMap.has(orderId)) {
        ordersMap.set(orderId, {
          ID: orderId,
          OrderID: orderId,
          UserEmail: row.UserEmail || row.useremail || row.User,
          User: row.UserEmail || row.useremail || row.User,
          Username: row.Username || row.username,
          Total: row.Total || row.total || 0,
          Status: row.Status || row.status || 'รอตรวจสอบ',
          SlipURL: row.SlipURL || row.slipurl,
          Address: row.Address || row.address,
          TrackingNo: row.TrackingNo || row.trackingno || row.Tracking || row.tracking,
          Timestamp: row.Timestamp || row.timestamp || row.CreatedAt || row.created_at,
          CreatedAt: row.Timestamp || row.timestamp || row.CreatedAt || row.created_at,
          DiscountInfo: row.DiscountInfo || row.discountinfo || row.Discount || row.discount || '',
          Discount: row.Discount || row.discount || 0,
          'Shipping Cost':
            row['Shipping Cost'] || row.ShippingCost || row.Shipping || row.shippingCost || row.shipping || 0,
          ShippingCost: row.ShippingCost || row.Shipping || row.shippingcost || row.shipping || 0,
          TotalWeight: row.TotalWeight || row.Weight || row.totalweight || row.weight || 0,
          PaymentMethod: row.PaymentMethod || row.paymentmethod,
          ShippingMethod: row.ShippingMethod || row.shippingmethod,
          Subdistrict: row.Subdistrict || row.subdistrict || null,
          District: row.District || row.district || null,
          Province: row.Province || row.province || null,
          PostalCode: row.PostalCode || row.postalcode || null,
          RecipientPhone: row.RecipientPhone || row.recipientphone || null,
          Items: []
        })
      }

      // Add item to order
      const itemName = row.ItemName || row.itemname || row.Itemname
      const itemQty = row.Qty || row.qty || 0
      const itemPrice = row.Price || row.price || 0
      
      if (itemName) {
        ordersMap.get(orderId).Items.push({
          id: row.ProductID || row.productid || null,
          name: itemName,
          qty: itemQty,
          price: itemPrice
        })
      }
    })

    const orders = Array.from(ordersMap.values())
    await enrichOrderItemsWithProductId(orders)
    return orders
  },

  // Get all orders (admin) — โหลดทุกแถว (ใช้รายงาน/หน้าอื่นที่ต้องการครบ)
  async getAllOrders() {
    const { data, error } = await supabase
      .from('order')
      .select('*')
      .order('Timestamp', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    const ordersData = buildOrdersFromRawRows(data || [])
    await enrichOrderItemsWithProductId(ordersData)
    await enrichOrdersWithCustomerDisplayNames(ordersData)
    return ordersData
  },

  /**
   * โหลดออเดอร์จากช่วงแถวในตาราง order (เรียง Timestamp ล่าสุดก่อน)
   * หมายเหตุ: PostgREST จำกัดแถวต่อ request (max-rows ค่าเริ่มต้น 1000)
   * จึงส่ง totalRowCount (count exact) กลับไปให้ผู้เรียกตัดสินใจว่ายังเหลือแถวอีกไหม
   * @returns {{ orders: Array, rawRowCount: number, totalRowCount: number|null }}
   */
  async getOrderRowsRange (fromInclusive, toInclusive) {
    const { data, error, count } = await supabase
      .from('order')
      .select('*', { count: 'exact' })
      .order('Timestamp', { ascending: false })
      .range(fromInclusive, toInclusive)

    if (error) {
      throw new Error(error.message)
    }
    const raw = data || []
    const ordersData = buildOrdersFromRawRows(raw)
    await enrichOrderItemsWithProductId(ordersData)
    await enrichOrdersWithCustomerDisplayNames(ordersData)
    return {
      orders: ordersData,
      rawRowCount: raw.length,
      totalRowCount: Number.isFinite(count) ? count : null
    }
  },

  /** รวมรายการจากการโหลดทีละหน้า (หน้าจัดการออเดอร์) */
  mergeGroupedOrderPages (existing, incoming) {
    return mergeOrderPageLists(existing, incoming)
  },

  // Place order
  // Note: Order table structure is like Google Sheets - one row per item
  // Columns: OrderID, UserEmail, Username, ItemName, Qty, Price, Total, Status, SlipURL, Address, TrackingNo, Timestamp, Discount, Shipping, TotalWeight
  /**
   * @param {object} orderData — เหมือน Checkout
   * @param {object} [options]
   * @param {boolean} [options.skipStockUpdate] — ไม่หักสต็อก
   * @param {boolean} [options.skipCouponUsage] — ไม่อัปเดตการใช้คูปอง
   * @param {boolean} [options.skipPromotionUsage] — ไม่อัปเดตการใช้โปรโมชัน
   */
  async placeOrder(orderData, options = {}) {
    const skipStockUpdate = options.skipStockUpdate === true
    const skipCouponUsage = options.skipCouponUsage === true
    const skipPromotionUsage = options.skipPromotionUsage === true

    // Build discount info string
    // Format for coupon: "Code: {code} (-{amount}B)"
    // Format for promotion: "Promotion: {amount}B" (if no coupon code)
    // Also include free items info: "FreeItems: {itemName}:{freeQty},..."
    let discountInfo = null
    const freeItemsInfo = []

    const adminMetaParts = []
    if (orderData.createdByAdmin) {
      adminMetaParts.push('แหล่งที่มา: สร้างโดยแอดมินหลังบ้าน')
    }
    if (orderData.adminDiscountNote != null && String(orderData.adminDiscountNote).trim()) {
      adminMetaParts.push(`หมายเหตุแอดมิน: ${String(orderData.adminDiscountNote).trim()}`)
    }
    const prefixAdminMeta = (base) => {
      const a = adminMetaParts.join(' | ')
      if (!a) return base || null
      if (!base) return a
      return `${a} | ${base}`
    }

    // Collect free items information
    if (orderData.items && Array.isArray(orderData.items)) {
      orderData.items.forEach(item => {
        if (item.freeQty && item.freeQty > 0) {
          freeItemsInfo.push(`${orderItemNameFirstLine(buildOrderLineItemName(item))}:${item.freeQty}`)
        }
      })
    }

    const promoIdList =
      orderData.promotions && Array.isArray(orderData.promotions)
        ? [...new Set(orderData.promotions.map((p) => p.id).filter(Boolean))]
        : []
    const promoIdsSuffix =
      promoIdList.length > 0 ? ` | PromoIds: ${promoIdList.join(',')}` : ''

    if (orderData.discountCode && orderData.discountAmount) {
      discountInfo = prefixAdminMeta(`Code: ${orderData.discountCode} (-${orderData.discountAmount}B)`)
      if (freeItemsInfo.length > 0) {
        discountInfo += ` | FreeItems: ${freeItemsInfo.join(',')}`
      }
      if (promoIdsSuffix) discountInfo += promoIdsSuffix
    } else if (orderData.promotionDiscount && orderData.promotionDiscount > 0) {
      discountInfo = prefixAdminMeta(`Promotion: -${orderData.promotionDiscount}B`)
      if (freeItemsInfo.length > 0) {
        discountInfo += ` | FreeItems: ${freeItemsInfo.join(',')}`
      }
      if (promoIdsSuffix) discountInfo += promoIdsSuffix
    } else if (orderData.discountAmount && Number(orderData.discountAmount) > 0) {
      discountInfo = prefixAdminMeta(`ส่วนลด: -${Number(orderData.discountAmount)}B`)
      if (freeItemsInfo.length > 0) {
        discountInfo += ` | FreeItems: ${freeItemsInfo.join(',')}`
      }
    } else if (freeItemsInfo.length > 0) {
      discountInfo = prefixAdminMeta(`FreeItems: ${freeItemsInfo.join(',')}`)
      if (promoIdsSuffix) discountInfo += promoIdsSuffix
    } else if (promoIdsSuffix) {
      discountInfo = prefixAdminMeta(promoIdsSuffix.replace(/^\s*\|\s*/, ''))
    } else if (adminMetaParts.length > 0) {
      discountInfo = adminMetaParts.join(' | ')
    }

    const checkoutTagParts = []
    if (orderData.supplierTag) {
      checkoutTagParts.push(`Supplier: ${String(orderData.supplierTag).trim()}`)
    }
    if (orderData.checkoutBatchId) {
      checkoutTagParts.push(`Batch: ${String(orderData.checkoutBatchId).trim()}`)
    }
    if (
      orderData.sharedSlipOrderIds &&
      Array.isArray(orderData.sharedSlipOrderIds) &&
      orderData.sharedSlipOrderIds.length > 0
    ) {
      checkoutTagParts.push(`สลิปเดียวกับออเดอร์: ${orderData.sharedSlipOrderIds.map(String).join(', ')}`)
    }
    if (checkoutTagParts.length > 0) {
      const append = checkoutTagParts.join(' | ')
      discountInfo = discountInfo ? `${discountInfo} | ${append}` : append
    }

    // Get username from user email (optional, can use email if not found)
    let username = orderData.user
    try {
      let { data: userData } = await supabase
        .from('users')
        .select('Username, username')
        .eq('Email', orderData.user)
        .maybeSingle()

      if (!userData) {
        const r2 = await supabase
          .from('users')
          .select('Username, username')
          .eq('email', orderData.user)
          .maybeSingle()
        userData = r2.data
      }

      const un = userData?.Username || userData?.username
      if (un) {
        username = un
      }
    } catch (e) {
      console.warn('Could not fetch username, using email:', e)
    }

    // Insert each item as a separate row (like Google Sheets structure)
    // Column names must match Supabase exactly. Price/Total/Discount/Weight รองรับทศนิยม (numeric) แล้ว
    const orderRows = orderData.items.map(item => {
      const qty = Math.round(Number(item.qty)) || 0
      const price = Number(item.price) ?? 0
      const total = Number(orderData.total) ?? 0
      const discount = (Number(orderData.discountAmount) || 0) + (Number(orderData.promotionDiscount) || 0)
      const shippingCost = Number(orderData.shippingCost) || 0
      const weight = Number(orderData.totalWeight) || 0
      return {
        OrderID: orderData.id,
        UserEmail: orderData.user,
        Username: username,
        ProductID: item.id || null,
        Itemname: buildOrderLineItemName(item),
        Qty: qty,
        Price: price,
        Total: total,
        Status: orderData.status || 'รอตรวจสอบ',
        SlipURL: orderData.slipURL || null,
        Address: orderData.address,
        Subdistrict: orderData.subdistrict || null,
        District: orderData.district || null,
        Province: orderData.province || null,
        PostalCode: orderData.postalCode || null,
        RecipientPhone: orderData.recipientPhone || null,
        TrackingNo: orderData.tracking || null,
        Timestamp: new Date().toISOString(),
        Discount: discount,
        DiscountInfo: discountInfo || null,
        'Shipping Cost': shippingCost,
        Weight: weight,
        ShippingMethod: orderData.shippingMethod || 'delivery',
        PaymentMethod: orderData.paymentMethod || 'transfer'
      }
    })

    // Insert with exact column names from Supabase
    try {
      const { data, error } = await supabase
        .from('order')
        .insert(orderRows)
        .select()

      if (error) {
        console.error('Order insert error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw new Error(error.message || 'Could not insert order')
      }

      if (data && data.length > 0) {
        const stockNote = orderData.createdByAdmin
          ? `สร้างออเดอร์แอดมิน - ${orderData.id}`
          : `ขาย/สั่งซื้อ - ออเดอร์: ${orderData.id}`

        // Update stock for each item after successful order placement
        // กรณีสินค้าชุด: ตัดตาม bundleSelections (สินค้าหลัก + ส่วนประกอบ) ไม่ตัดรหัสชุดแม่ซ้ำ
        if (!skipStockUpdate) {
          try {
            const stockOutMap = new Map()
            const addOut = (productId, qty) => {
              const pid = String(productId || '').trim()
              const q = Number(qty || 0)
              if (!pid || !Number.isFinite(q) || q <= 0) return
              stockOutMap.set(pid, (stockOutMap.get(pid) || 0) + q)
            }

            for (const item of orderData.items) {
              const bundleSelections = item?.bundleSelections && typeof item.bundleSelections === 'object'
                ? item.bundleSelections
                : null
              if (bundleSelections && Object.keys(bundleSelections).length > 0) {
                Object.entries(bundleSelections).forEach(([pid, q]) => addOut(pid, q))
              } else {
                addOut(item.id, item.qty)
              }
            }

            for (const [productId, qtyOut] of stockOutMap.entries()) {
              const product = await productService.getProduct(productId)
              if (!product) continue
              const newStock = Math.max(0, (product.stock || 0) - qtyOut)
              await productService.updateStock(
                productId,
                newStock,
                orderData.user,
                'OUT',
                `${stockNote} (ตัด ${qtyOut})`
              )
              console.log(`Stock updated for ${productId}: ${product.stock} -> ${newStock} (OUT ${qtyOut})`)
            }
          } catch (stockError) {
            console.error('Error updating stock:', stockError)
            // Don't throw error - order is already placed, just log the issue
            // Admin can manually adjust stock if needed
          }
        }

        // Update coupon usage count if discount code was used
        if (!skipCouponUsage && orderData.discountCode) {
          try {
            // First, get current usage count
            const { data: couponData, error: fetchError } = await supabase
              .from('coupons')
              .select('UsageCount')
              .eq('Code', orderData.discountCode.toUpperCase())
              .maybeSingle()
            
            if (!fetchError && couponData) {
              const newUsageCount = (couponData.UsageCount || 0) + 1
              const { error: updateError } = await supabase
                .from('coupons')
                .update({ UsageCount: newUsageCount })
                .eq('Code', orderData.discountCode.toUpperCase())
              
              if (updateError) {
                console.error('Error updating coupon usage count:', updateError)
                // Don't throw error - order is already placed
              } else {
                console.log(`Coupon usage count updated for code: ${orderData.discountCode} (${newUsageCount})`)
              }
            } else if (fetchError) {
              console.error('Error fetching coupon for usage count update:', fetchError)
            }
          } catch (couponUpdateError) {
            console.error('Error updating coupon usage count:', couponUpdateError)
            // Don't throw error - order is already placed
          }
        }

        // Update promotion usage count if promotions were used
        if (!skipPromotionUsage && orderData.promotions && Array.isArray(orderData.promotions) && orderData.promotions.length > 0) {
          try {
            for (const promotion of orderData.promotions) {
              if (promotion.id) {
                // Get current usage and promotion stock counters.
                const { data: promotionData, error: fetchError } = await supabase
                  .from('promotions')
                  .select('UsageCount, PromotionStockLimit, PromotionStockUsed')
                  .eq('id', promotion.id)
                  .maybeSingle()
                
                if (!fetchError && promotionData) {
                  const newUsageCount = (promotionData.UsageCount || 0) + 1
                  const stockLimit = Number(promotionData.PromotionStockLimit) || 0
                  const stockUsed = Number(promotionData.PromotionStockUsed) || 0
                  const appliedStockQty = Math.max(0, Math.round(Number(promotion.appliedStockQty) || 0))
                  const newStockUsed = stockUsed + appliedStockQty
                  const updatePayload = { UsageCount: newUsageCount }
                  if (appliedStockQty > 0) {
                    updatePayload.PromotionStockUsed = newStockUsed
                  }
                  if (stockLimit > 0 && newStockUsed >= stockLimit) {
                    updatePayload.Status = 'inactive'
                  }
                  const { error: updateError } = await supabase
                    .from('promotions')
                    .update(updatePayload)
                    .eq('id', promotion.id)
                  
                  if (updateError) {
                    console.error(`Error updating promotion usage count for ID ${promotion.id}:`, updateError)
                    // Don't throw error - order is already placed
                  } else {
                    console.log(`Promotion usage count updated for ID: ${promotion.id} (${newUsageCount})`)
                  }
                } else if (fetchError) {
                  console.error(`Error fetching promotion for usage count update (ID: ${promotion.id}):`, fetchError)
                }
              }
            }
          } catch (promotionUpdateError) {
            console.error('Error updating promotion usage count:', promotionUpdateError)
            // Don't throw error - order is already placed
          }
        }

        // Return first inserted row as representative (for compatibility with existing code)
        return data[0]
      }

      throw new Error('Order inserted but no data returned')
    } catch (error) {
      throw new Error(error.message || 'Could not insert order')
    }
  },

  // Update order status
  // Note: Order table has multiple rows per order (one per item), so we update all rows with matching OrderID
  async updateOrderStatus(orderId, status, tracking = null) {
    const updateData = { Status: status }
    if (tracking) {
      updateData.TrackingNo = tracking // Use TrackingNo column name from Supabase
    }

    // Try different column name variations for OrderID
    let data = null
    let error = null

    // Try OrderID first (as per Supabase schema)
    const result1 = await supabase
      .from('order')
      .update(updateData)
      .eq('OrderID', orderId)
      .select()

    if (result1.error) {
      // Try ID as fallback
      const result2 = await supabase
        .from('order')
        .update(updateData)
        .eq('ID', orderId)
        .select()
      
      if (result2.error) {
        error = result2.error
      } else {
        data = result2.data
      }
    } else {
      data = result1.data
    }

    if (error) {
      throw new Error(error.message)
    }

    return data
  },

  // Edit order - update items, prices, quantities, and shipping
  // This deletes old order rows and creates new ones with updated data
  async editOrder(orderId, newItems, newShipping = null, userEmail) {
    try {
      // Get current order data (ลอง OrderID ก่อน แล้วลอง orderid ถ้าไม่มีแถว)
      let currentOrderRows = null
      let fetchError = null
      const res1 = await supabase.from('order').select('*').eq('OrderID', orderId)
      fetchError = res1.error
      currentOrderRows = res1.data
      if ((fetchError || !currentOrderRows || currentOrderRows.length === 0)) {
        const res2 = await supabase.from('order').select('*').eq('orderid', orderId)
        if (!res2.error && res2.data && res2.data.length > 0) {
          fetchError = null
          currentOrderRows = res2.data
        }
      }

      if (fetchError) {
        // Try ID as fallback
        const { data: altRows, error: altError } = await supabase
          .from('order')
          .select('*')
          .eq('ID', orderId)

        if (altError) {
          throw new Error(altError.message)
        }

        if (!altRows || altRows.length === 0) {
          throw new Error('Order not found')
        }

        // Get metadata from first row
        const firstRow = altRows[0]
        const oldTotal = altRows.reduce((sum, row) => {
          const qty = row.Qty || row.qty || 0
          const price = row.Price || row.price || 0
          return sum + (qty * price)
        }, 0)

        // Calculate new total
        const newTotal = newItems.reduce((sum, item) => sum + (item.price * item.qty), 0) + (newShipping || firstRow['Shipping Cost'] || firstRow.Shipping || 0)

        // Delete old order rows
        const deleteResult = await supabase
          .from('order')
          .delete()
          .eq('ID', orderId)

        if (deleteResult.error) {
          throw new Error(deleteResult.error.message)
        }

        // Create new order rows (ค่า Price/Total ฯลฯ เป็นตัวเลข รองรับทศนิยม)
        const orderRows = newItems.map(item => ({
          OrderID: orderId,
          UserEmail: firstRow.UserEmail || firstRow.useremail,
          Username: firstRow.Username || firstRow.username,
          ProductID: item.id || item.productId || null,
          Itemname: item.name,
          Qty: Math.round(Number(item.qty)) || 0,
          Price: Number(item.price) ?? 0,
          Total: Number(newTotal) ?? 0,
          Status: firstRow.Status || firstRow.status || 'รอตรวจสอบ',
          SlipURL: firstRow.SlipURL || firstRow.slipurl,
          Address: firstRow.Address || firstRow.address,
          TrackingNo: firstRow.TrackingNo || firstRow.trackingno,
          Timestamp: firstRow.Timestamp || firstRow.timestamp || new Date().toISOString(),
          Discount: Number(firstRow.Discount ?? firstRow.discount ?? 0) || 0,
          'Shipping Cost': newShipping !== null ? Number(newShipping) : (Number(firstRow['Shipping Cost'] ?? firstRow.Shipping ?? 0) || 0),
          Weight: Number(firstRow.Weight ?? firstRow.weight ?? 0) || 0
        }))

        const { data: insertedData, error: insertError } = await supabase
          .from('order')
          .insert(orderRows)
          .select()

        if (insertError) {
          throw new Error(insertError.message)
        }

        return {
          success: true,
          oldTotal: oldTotal,
          newTotal: newTotal,
          diff: newTotal - oldTotal,
          data: insertedData
        }
      }

      if (!currentOrderRows || currentOrderRows.length === 0) {
        throw new Error('Order not found')
      }

      // Get metadata from first row
      const firstRow = currentOrderRows[0]
      const oldTotal = currentOrderRows.reduce((sum, row) => {
        const qty = row.Qty || row.qty || 0
        const price = row.Price || row.price || 0
        return sum + (qty * price)
      }, 0)

      // Calculate new total
      const newTotal = newItems.reduce((sum, item) => sum + (item.price * item.qty), 0) + (newShipping !== null ? newShipping : (firstRow['Shipping Cost'] || firstRow.Shipping || 0))

      // Delete old order rows (ลอง OrderID ก่อน แล้วลอง orderid)
      let deleteResult = await supabase.from('order').delete().eq('OrderID', orderId)
      if (deleteResult.error) {
        deleteResult = await supabase.from('order').delete().eq('orderid', orderId)
      }
      if (deleteResult.error) {
        throw new Error(deleteResult.error.message)
      }

      // Create new order rows (ค่า Price/Total ฯลฯ เป็นตัวเลข รองรับทศนิยม)
      const orderRows = newItems.map(item => ({
        OrderID: orderId,
        UserEmail: firstRow.UserEmail || firstRow.useremail,
        Username: firstRow.Username || firstRow.username,
        ProductID: item.id || item.productId || null,
        Itemname: item.name,
        Qty: Math.round(Number(item.qty)) || 0,
        Price: Number(item.price) ?? 0,
        Total: Number(newTotal) ?? 0,
        Status: firstRow.Status || firstRow.status || 'รอตรวจสอบ',
        SlipURL: firstRow.SlipURL || firstRow.slipurl,
        Address: firstRow.Address || firstRow.address,
        TrackingNo: firstRow.TrackingNo || firstRow.trackingno,
        Timestamp: firstRow.Timestamp || firstRow.timestamp || new Date().toISOString(),
        Discount: Number(firstRow.Discount ?? firstRow.discount ?? 0) || 0,
        'Shipping Cost': newShipping !== null ? Number(newShipping) : (Number(firstRow['Shipping Cost'] ?? firstRow.Shipping ?? 0) || 0),
        Weight: Number(firstRow.Weight ?? firstRow.weight ?? 0) || 0,
        ShippingMethod: firstRow.ShippingMethod || firstRow.shipping_method || 'delivery',
        PaymentMethod: firstRow.PaymentMethod || firstRow.payment_method || 'transfer'
      }))

      const { data: insertedData, error: insertError } = await supabase
        .from('order')
        .insert(orderRows)
        .select()

      if (insertError) {
        throw new Error(insertError.message)
      }

      return {
        success: true,
        oldTotal: oldTotal,
        newTotal: newTotal,
        diff: newTotal - oldTotal,
        data: insertedData
      }
    } catch (error) {
      throw new Error(error.message || 'Could not edit order')
    }
  }
}
