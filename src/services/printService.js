import { escapeHtml } from '../utils/helpers'
import { freeQtyForLineItem, orderItemNameFirstLine } from '../utils/orderLineItemDescription'
import { LOGO_URL } from '../utils/constants'
import { getShopInfo, getVatRate, calcVatFromTotal } from './shopSettingsService'
import { supabase } from '../utils/supabase'

// Helper function to open print window
const escapeHtmlMultiline = (text) => escapeHtml(text || '').replace(/\n/g, '<br>')

const openPrintWindow = (content) => {
  const printWindow = window.open('', '_blank')
  printWindow.document.write(content)
  printWindow.document.close()
  printWindow.focus()
  const printWhenReady = () => {
    const images = Array.from(printWindow.document.images || [])
    if (images.length === 0) {
      printWindow.print()
      return
    }
    let done = false
    const finish = () => {
      if (done) return
      done = true
      printWindow.print()
    }
    const waitForImages = Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve()
        return new Promise((resolve) => {
          img.onload = resolve
          img.onerror = resolve
        })
      })
    )
    Promise.race([
      waitForImages,
      new Promise((resolve) => setTimeout(resolve, 2500))
    ]).then(finish)
  }
  setTimeout(printWhenReady, 100)
}

const renderSignatureHtml = (shop) => {
  const signatureUrl = String(shop?.signature || '').trim()
  if (!signatureUrl) return ''
  return `
    <div style="position:absolute; top:25px; left:50%; transform:translateX(-50%); width:150px; height:70px; display:flex; align-items:center; justify-content:center; z-index:2;">
      <img src="${escapeHtml(signatureUrl)}" style="max-width:100%; max-height:130%; object-fit:contain; opacity:1.0; background:transparent; padding:0 8px;" onerror="this.style.display='none';" />
    </div>
  `
}

// Helper function to format date
const formatOrderDate = (dateStr) => {
  if (!dateStr) return new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
  
  try {
    // First, try to parse as ISO date string (from Supabase Timestamp)
    if (typeof dateStr === 'string' && dateStr.includes('T')) {
      const dateObj = new Date(dateStr)
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
      }
    }
    
    // Try parsing as Date object
    if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
      return dateStr.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    }
    
    // Try parsing Thai date format (dd/mm/yyyy)
    const dateMatch = dateStr.toString().trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (dateMatch) {
      const day = parseInt(dateMatch[1])
      const month = parseInt(dateMatch[2]) - 1
      const year = parseInt(dateMatch[3])
      const ceYear = year - 543 // Convert BE to CE
      const dateObj = new Date(ceYear, month, day)
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
      }
    }
  } catch (e) {
    console.error('Error formatting date:', e, dateStr)
  }
  
  // Fallback to current date only if all parsing fails
  return new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
}

const USERS_SHIPPING_SELECT =
  'Username, Phone, Address, Subdistrict, District, Province, PostalCode'

function pickStr(...vals) {
  for (const v of vals) {
    if (v == null || v === 'NULL') continue
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

function normalizeShippingProfileRow(data) {
  if (!data || typeof data !== 'object') return null
  return {
    username: pickStr(data.Username, data.username),
    phone: pickStr(data.Phone, data.phone, data.PhoneNumber, data.phonenumber),
    address: pickStr(data.Address, data.address),
    subdistrict: pickStr(data.Subdistrict, data.subdistrict),
    district: pickStr(data.District, data.district),
    province: pickStr(data.Province, data.province),
    postalCode: pickStr(data.PostalCode, data.postalcode, data.postalCode)
  }
}

/** ดึง Username / Phone / ที่อยู่แยกฟิลด์จากตาราง users */
async function fetchCustomerShippingProfile(userEmail) {
  const em = String(userEmail || '').trim()
  if (!em) return null
  try {
    let { data, error } = await supabase
      .from('users')
      .select(USERS_SHIPPING_SELECT)
      .eq('Email', em)
      .maybeSingle()
    if (error || !data) {
      const r2 = await supabase
        .from('users')
        .select(USERS_SHIPPING_SELECT)
        .eq('email', em)
        .maybeSingle()
      data = r2.data
      error = r2.error
    }
    if (error || !data) return null
    return normalizeShippingProfileRow(data)
  } catch (e) {
    console.error('fetchCustomerShippingProfile:', e)
    return null
  }
}

/** รวมข้อมูลจาก users กับ snapshot บนออเดอร์ (กรณีโปรไฟล์ว่างหรือออเดอร์เก่า) */
function mergeShippingProfileWithOrder(profile, order) {
  const o = order || {}
  const p = profile || {}
  return {
    username: pickStr(p.username, o.Username, o.username, o.UserEmail, o.User),
    phone: pickStr(p.phone, o.RecipientPhone, o.recipientphone, o.Phone, o.phone),
    address: pickStr(p.address, o.Address, o.address),
    subdistrict: pickStr(p.subdistrict, o.Subdistrict, o.subdistrict),
    district: pickStr(p.district, o.District, o.district),
    province: pickStr(p.province, o.Province, o.province),
    postalCode: pickStr(p.postalCode, o.PostalCode, o.postalcode)
  }
}

/**
 * HTML บล็อกที่อยู่จัดส่ง (ชื่อ, ที่อยู่, แขวง/อำเภอ/จังหวัด/ไปรษณีย์, โทร.)
 * @param {{ variant?: 'label' | 'receipt' | 'tax' }} opts
 */
function formatShippingAddressHtml(p, opts = {}) {
  const variant = opts.variant || 'label'
  const useClass = variant === 'label'
  const nameClass = 'customer-name'
  const lineClass = 'customer-address'
  const lineStyleReceipt = 'margin-bottom:2px;font-size:7pt;line-height:1.45;'
  const nameStyleReceipt = 'font-weight:bold;font-size:8pt;margin-bottom:4px;line-height:1.45;'
  const lineStyleTax = 'margin-bottom:2px;font-size:7pt;line-height:1.45;color:#333;'
  const nameStyleTax = 'font-weight:bold;font-size:8pt;margin-bottom:4px;color:#333;'

  const bits = []
  if (p.username) {
    const inner = escapeHtml(p.username)
    bits.push(
      useClass
        ? `<div class="${nameClass}" style="font-weight:bold;">${inner}</div>`
        : `<div style="${variant === 'tax' ? nameStyleTax : nameStyleReceipt}">${inner}</div>`
    )
  }
  if (p.address) {
    const inner = `<strong>ที่อยู่</strong> ${escapeHtml(p.address)}`
    bits.push(
      useClass
        ? `<div class="${lineClass}">${inner}</div>`
        : `<div style="${variant === 'tax' ? lineStyleTax : lineStyleReceipt}">${inner}</div>`
    )
  }
  const loc = []
  if (p.subdistrict) loc.push(`แขวง/ตำบล ${escapeHtml(p.subdistrict)}`)
  if (p.district) loc.push(`อำเภอ/เขต ${escapeHtml(p.district)}`)
  if (p.province) loc.push(`จังหวัด ${escapeHtml(p.province)}`)
  if (p.postalCode) loc.push(`รหัสไปรษณีย์ ${escapeHtml(p.postalCode)}`)
  if (loc.length) {
    const inner = loc.join(' ')
    bits.push(
      useClass
        ? `<div class="${lineClass}">${inner}</div>`
        : `<div style="${variant === 'tax' ? lineStyleTax : lineStyleReceipt}">${inner}</div>`
    )
  }
  if (p.phone) {
    const inner = `<strong>โทร.</strong> ${escapeHtml(p.phone)}`
    const mt = useClass ? 'margin-top:4px;' : 'margin-top:2px;'
    bits.push(
      useClass
        ? `<div class="${lineClass}" style="${mt}">${inner}</div>`
        : `<div style="${variant === 'tax' ? lineStyleTax : lineStyleReceipt}${mt}">${inner}</div>`
    )
  }
  if (!bits.length) {
    bits.push(
      useClass
        ? `<div class="${lineClass}">${escapeHtml('-')}</div>`
        : `<div style="${lineStyleReceipt}">${escapeHtml('-')}</div>`
    )
  }
  return bits.join('')
}

function getShippingMethodLabel(order) {
  const method = String(order?.ShippingMethod || order?.shippingmethod || order?.shipping_method || '').trim().toLowerCase()
  return method === 'pickup' ? 'รับเอง' : 'จัดส่ง'
}

function getLineItemNote(item) {
  return String(item?.note || item?.notes || item?.Notes || '').trim()
}

function getAdminOrderNote(order) {
  const info = String(order?.DiscountInfo || order?.discountInfo || '').trim()
  if (!info) return ''
  const part = info
    .split('|')
    .map((x) => x.trim())
    .find((x) => x.startsWith('หมายเหตุแอดมิน:'))
  return part ? part.replace(/^หมายเหตุแอดมิน:\s*/, '').trim() : ''
}

const fetchCustomerPhone = async (userEmail) => {
  const row = await fetchCustomerShippingProfile(userEmail)
  return row?.phone || ''
}

export const printService = {
  // Print Shipping Label (ใบปะหน้ากล่องพัสดุ)
  async printShippingLabel(order) {
    const shop = await getShopInfo()
    const userEmail = order.UserEmail || order.User || ''
    const userRow = await fetchCustomerShippingProfile(userEmail)
    const recipient = mergeShippingProfileWithOrder(userRow, order)
    const shippingHtml = formatShippingAddressHtml(recipient, { variant: 'label' })
    const totalItems = (order.Items || []).reduce((sum, item) => sum + (item.qty || 0), 0)
    
    const fullAddress = shop.address.split('\n')[0] || ''
    const addressParts = fullAddress.split('เขตบางซื่อ')
    const addressLine1 = addressParts[0] ? addressParts[0].trim() : ''
    const addressLine2 = addressParts[1] ? ('เขตบางซื่อ' + addressParts[1]).trim() : ''
    const shopPhone = shop.address.split('\n')[1]?.replace('โทร. ', '') || shop.phone || ''
    
    const trackingHtml = order.TrackingNumber ? `
      <div class="tracking-box">
        <div class="tracking-label">🚚 เลขพัสดุ</div>
        <div class="tracking-number">${escapeHtml(order.TrackingNumber)}</div>
      </div>
    ` : ''
    
    const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Shipping Label</title>
      <style>
        @page { 
          size: 100mm 150mm; 
          margin: 6mm 4mm; 
        }
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body { 
          font-family: 'Sarabun', 'Arial', sans-serif; 
          padding: 0; 
          margin: 0; 
          line-height: 1.5; 
          color: #000; 
          font-size: 10pt;
          background: white;
        }
        .container {
          width: 100%;
          max-width: 92mm;
          margin: 0 auto;
        }
        .header-section {
          padding: 6px 0;
          margin-bottom: 12px;
          text-align: center;
        }
        .company-name { 
          font-size: 11pt; 
          font-weight: bold; 
          text-align: center; 
          margin-bottom: 6px;
          line-height: 1.3;
          letter-spacing: 0.3px;
          white-space: nowrap;
        }
        .shop-address { 
          font-size: 8pt; 
          text-align: center; 
          color: #333;
          line-height: 1.4;
          margin-bottom: 3px;
        }
        .shop-phone { 
          font-size: 8pt; 
          text-align: center; 
          color: #333;
          line-height: 1.4;
        }
        .order-section {
          padding: 8px 0;
          margin: 10px 0;
          text-align: center;
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
        }
        .order-id { 
          font-size: 11pt; 
          font-weight: bold; 
          color: #000;
          letter-spacing: 1px;
          font-family: 'Arial', monospace;
        }
        .customer-box {
          border: 1.5px solid #000;
          padding: 8px 6px;
          margin: 10px 0;
          background: #fff;
        }
        .customer-label { 
          font-size: 9pt; 
          font-weight: bold; 
          margin-bottom: 5px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #000;
          padding-bottom: 3px;
        }
        .customer-name { 
          font-size: 11pt; 
          font-weight: bold; 
          margin-bottom: 4px;
          margin-top: 4px;
        }
        .customer-address { 
          font-size: 9pt; 
          line-height: 1.5;
          word-break: break-word;
        }
        .info-box {
          border: 1px dashed #666;
          padding: 6px;
          margin: 8px 0;
          text-align: center;
          background: #f9f9f9;
        }
        .items-count { 
          font-size: 9pt; 
          font-weight: bold;
        }
        .tracking-box {
          padding: 6px;
          margin: 8px 0;
          text-align: center;
          background: #fff;
          border: 1px dashed #666;
        }
        .tracking-label {
          font-size: 7pt;
          font-weight: bold;
          margin-bottom: 3px;
          text-transform: uppercase;
        }
        .tracking-number {
          font-size: 11pt;
          font-weight: bold;
          font-family: 'Arial', monospace;
          letter-spacing: 1px;
        }
        @media print {
          body { margin: 0; padding: 0; }
          .container { page-break-inside: avoid; }
        }
      </style>
    </head><body>
      <div class="container">
        <div class="header-section">
          <div class="company-name">${escapeHtml(shop.name)}</div>
          <div class="shop-address">${escapeHtml(addressLine1)}</div>
          <div class="shop-address">${escapeHtml(addressLine2)}</div>
          <div class="shop-phone">โทร. ${escapeHtml(shopPhone)}</div>
        </div>
        
        <div class="order-section">
          <div class="order-id">${escapeHtml(order.ID || order.OrderID || '')}</div>
        </div>
        
        <div class="customer-box">
          <div class="customer-label">📦 ส่งถึง</div>
          ${shippingHtml}
        </div>
        
        <div class="info-box">
          <div class="items-count">จำนวนรายการ: ${totalItems} รายการ</div>
        </div>
        
        ${trackingHtml}
      </div>
    </body></html>`
    
    openPrintWindow(content)
  },

  // Print Receipt (ใบเสร็จรับเงิน)
  async printReceipt(order) {
    const shop = await getShopInfo()
    const userEmail = order.UserEmail || order.User || ''
    const userRow = await fetchCustomerShippingProfile(userEmail)
    const recipient = mergeShippingProfileWithOrder(userRow, order)
    const shippingHtml = formatShippingAddressHtml(recipient, { variant: 'receipt' })
    const items = order.Items || []
    
    const itemsHtml = items.map((it, i) => {
      const itemNote = getLineItemNote(it)
      const noteHtml = itemNote
        ? `<div style="margin-top:3px;color:#92400e;font-size:7pt;"><strong>หมายเหตุสินค้า:</strong> ${escapeHtml(itemNote)}</div>`
        : ''
      return `
        <tr>
          <td style="text-align:center;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${i+1}</td>
          <td style="border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${escapeHtmlMultiline(it.name)}${noteHtml}</td>
          <td style="text-align:center;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${it.qty || 0}</td>
          <td style="text-align:right;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${Number(it.price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
          <td style="text-align:right;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${(Number(it.price || 0) * (it.qty || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
        </tr>
      `
    }).join('')
    
    // Parse discount info to separate coupon discount and promotion discount
    let couponDiscount = 0
    let promotionDiscount = 0
    const discountInfo = String(order.DiscountInfo || order.discountInfo || "")
    
    // Parse free items from DiscountInfo to calculate subtotal correctly
    const freeItemsMatch = discountInfo.match(/FreeItems:\s*([^|]+)/i)
    const freeItemsMap = new Map()
    if (freeItemsMatch) {
      const freeItemsStr = freeItemsMatch[1].trim()
      freeItemsStr.split(',').forEach(itemStr => {
        const match = itemStr.trim().match(/^(.+?):(\d+)$/)
        if (match) {
          const itemName = match[1].trim()
          const freeQty = parseInt(match[2])
          freeItemsMap.set(itemName, freeQty)
        }
      })
    }
    
    // Calculate subtotal excluding free items
    const subtotal = items.reduce((s, i) => {
      const freeQty = freeQtyForLineItem(freeItemsMap, i.name)
      const paidQty = Math.max(0, (i.qty || 0) - freeQty)
      return s + (Number(i.price || 0) * paidQty)
    }, 0)
    
    // Check for coupon code (format: "Code: XXX (-XXB)")
    const couponMatch = discountInfo.match(/Code:.*?\(-(\d+(?:\.\d+)?)B?\)/i)
    if (couponMatch) {
      couponDiscount = parseFloat(couponMatch[1])
    }
    
    // Check for promotion (format: "Promotion: -XXB")
    const promotionMatch = discountInfo.match(/Promotion:\s*-?(\d+(?:\.\d+)?)B?/i)
    if (promotionMatch) {
      promotionDiscount = parseFloat(promotionMatch[1])
    }
    
    // If no specific format found, try to parse from DiscountInfo or Discount column
    if (couponDiscount === 0 && promotionDiscount === 0) {
      const match = discountInfo.match(/-(\d+(?:\.\d+)?)B/)
      if (match) {
        // If DiscountInfo contains "Code:" but no amount, or if it's just a number
        if (discountInfo.includes('Code:')) {
          couponDiscount = parseFloat(match[1])
        } else {
          promotionDiscount = parseFloat(match[1])
        }
      } else {
        // Try to get discount from Amount in DiscountInfo
        const amountMatch = discountInfo.match(/Amount:\s*(\d+(?:\.\d+)?)/i)
        if (amountMatch) {
          if (discountInfo.includes('Code:')) {
            couponDiscount = parseFloat(amountMatch[1])
          } else {
            promotionDiscount = parseFloat(amountMatch[1])
          }
        } else {
          // Fallback to Discount column - check if DiscountInfo has "Code:" to determine type
          const totalDiscount = Number(order.Discount || order.discount || 0)
          if (discountInfo.includes('Code:')) {
            couponDiscount = totalDiscount
          } else if (totalDiscount > 0) {
            promotionDiscount = totalDiscount
          }
        }
      }
    }
    
    // Calculate free items value (มูลค่าสินค้าแถม)
    let freeItemsValue = 0
    if (freeItemsMap.size > 0) {
      items.forEach(item => {
        const freeQty = freeQtyForLineItem(freeItemsMap, item.name)
        if (freeQty > 0) {
          freeItemsValue += (Number(item.price || 0) * freeQty)
        }
      })
    }
    
    const totalDiscount = couponDiscount + promotionDiscount
    // Try multiple column name variations including 'Shipping Cost' (with space)
    const shipping = Number(
      order['Shipping Cost'] || 
      order.ShippingCost || 
      order.Shipping || 
      order.shippingCost || 
      order.shipping || 
      0
    )
    console.log('[printService] Receipt shipping cost:', {
      orderId: order.ID || order.OrderID,
      'Shipping Cost': order['Shipping Cost'],
      ShippingCost: order.ShippingCost,
      Shipping: order.Shipping,
      shippingCost: order.shippingCost,
      shipping: order.shipping,
      finalShipping: shipping,
      allKeys: Object.keys(order)
    })
    const grandTotal = subtotal - totalDiscount + shipping
    const adminOrderNote = getAdminOrderNote(order)
    const adminOrderNoteHtml = adminOrderNote
      ? `<div style="margin-top: 12px; border: 1px solid #d1d5db; background: #ffffff; color: #111827; border-radius: 4px; padding: 8px; font-size: 8pt;"><strong>หมายเหตุแอดมิน:</strong> ${escapeHtml(adminOrderNote)}</div>`
      : ''
    
    // Use Timestamp (order date) instead of current date
    const orderDateStr = formatOrderDate(order.Timestamp || order.CreatedAt || order.date)
    
    const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt</title>
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: 'Sarabun', sans-serif; padding: 0; line-height: 1.3; color: #333; font-size: 8pt; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        th { background: #1f2937 !important; color: white !important; border: 1px solid #1f2937; padding: 6px 4px; font-size: 8pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; border-bottom: 2px solid #1f2937; padding-bottom: 10px; }
        .box { border: 1px solid #ccc; padding: 10px; margin-bottom: 15px; border-radius: 4px; font-size: 8pt; }
        td { font-size: 8pt; padding: 6px 4px; }
        @media print {
          body { margin: 0; padding: 0; }
        }
      </style>
    </head><body>
      <div class="header">
        <div style="width: 60%; text-align: left;">
          <h2 style="margin: 0 0 4px 0; font-size: 12pt; font-weight: bold; color: #1f2937;">${escapeHtml(shop.name)}</h2>
          <div style="font-size: 7pt; color: #333; line-height: 1.4; margin-bottom: 2px;">${escapeHtml(shop.address).replace(/\n/g, '<br>')}</div>
          <div style="font-size: 7pt; color: #333; line-height: 1.4;">
            <strong>โทร.</strong> ${escapeHtml(shop.phone || '')}
          </div>
        </div>
        <div style="width: 40%; text-align: right;">
          <h1 style="margin: 0; font-size: 14pt; font-weight: bold; color: #1f2937;">ใบเสร็จรับเงิน</h1>
          <p style="margin: 4px 0; font-size: 7pt; color: #666;">(Receipt)</p>
          <div style="border: 1px solid #ddd; padding: 8px; border-radius: 4px; background-color: #f9fafb; display: inline-block; text-align: right; margin-top: 8px;">
            <div style="font-size: 7pt;"><strong>เลขที่:</strong> ${escapeHtml(order.ID || order.OrderID || '')}</div>
            <div style="font-size: 7pt;"><strong>วันที่:</strong> ${orderDateStr}</div>
          </div>
        </div>
      </div>
      <div class="box" style="background-color: #f9fafb;">
        <h3 style="margin: 0 0 8px 0; font-size: 8pt; font-weight: bold; color: #1f2937; border-bottom: 1px solid #eee; padding-bottom: 4px;">ลูกค้า (Customer)</h3>
        <div>${shippingHtml}</div>
      </div>
      <table style="width: 100%; border: 1px solid #ddd;">
        <thead>
          <tr>
            <th style="width: 5%; text-align: center;">#</th>
            <th style="width: 40%;">รายการ</th>
            <th style="width: 10%; text-align: center;">จำนวน</th>
            <th style="width: 20%; text-align: right;">ราคา/หน่วย</th>
            <th style="width: 20%; text-align: right;">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr><td colspan="4" style="text-align: right; font-weight: bold; padding: 6px 4px;">รวมเงิน</td><td style="text-align: right; padding: 6px 4px;">${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
          ${couponDiscount > 0 ? `<tr><td colspan="4" style="text-align: right; color: #dc2626; padding: 6px 4px;">ส่วนลด (โค้ดส่วนลด)</td><td style="text-align: right; color: #dc2626; padding: 6px 4px;">-${couponDiscount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>` : ''}
          ${(promotionDiscount > 0 || freeItemsValue > 0) ? `<tr><td colspan="4" style="text-align: right; color: #dc2626; padding: 6px 4px;">โปรโมชั่น${promotionDiscount > 0 && freeItemsValue > 0 ? ' (ส่วนลด + แถม)' : promotionDiscount > 0 ? '' : ' (แถมสินค้า)'}</td><td style="text-align: right; color: #dc2626; padding: 6px 4px;">-${(promotionDiscount + freeItemsValue).toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>` : ''}
          <tr><td colspan="4" style="text-align: right; padding: 6px 4px;">ค่าขนส่ง</td><td style="text-align: right; padding: 6px 4px;">${shipping.toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
          <tr style="background-color: #1f2937 !important; color: white !important; font-weight: bold; font-size: 10pt; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            <td colspan="4" style="text-align: right; padding: 8px 4px;">ยอดสุทธิ</td>
            <td style="text-align: right; padding: 8px 4px;">${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท</td>
          </tr>
        </tfoot>
      </table>
      ${adminOrderNoteHtml}
      <div style="margin-top: 30px; text-align: center; font-size: 8pt; color: #666;">
        <p>ขอบคุณที่ใช้บริการ</p>
      </div>
    </body></html>`
    
    openPrintWindow(content)
  },

  /** พิมพ์รายละเอียดออเดอร์ (ตรงกับหน้าดูรายละเอียดใน Admin Orders) */
  async printOrderDetail(order) {
    const shop = await getShopInfo()
    const orderId = order.ID || order.OrderID || ''
    const orderDateStr = formatOrderDate(order.Timestamp || order.CreatedAt || order.date)
    const customerName = order.Username || order.UserEmail || order.User || '-'
    const pmRaw = String(order.PaymentMethod ?? order.paymentmethod ?? '')
      .trim()
      .toLowerCase()
    const paymentLabel =
      pmRaw === 'credit' ? 'เครดิต' : pmRaw === 'transfer' ? 'โอนเงิน' : 'ไม่ระบุ'
    const shippingLabel = getShippingMethodLabel(order)
    const discountInfo = String(order.DiscountInfo || order.discountInfo || '')
    const batchMatch = discountInfo.match(/Batch:\s*([^|]+)/i)
    const batchLine = batchMatch
      ? `<div class="meta"><strong>ชุดชำระ:</strong> ${escapeHtml(batchMatch[1].trim())}</div>`
      : ''

    const freeItemsMatch = discountInfo.match(/FreeItems:\s*([^|]+)/i)
    const freeItemsMap = new Map()
    if (freeItemsMatch) {
      freeItemsMatch[1]
        .trim()
        .split(',')
        .forEach((itemStr) => {
          const match = itemStr.trim().match(/^(.+?):(\d+)$/)
          if (match) freeItemsMap.set(match[1].trim(), parseInt(match[2], 10))
        })
    }

    const items = order.Items || []
    let subtotal = 0
    const rowsHtml = items
      .map((item, idx) => {
        const productId = item.id || orderItemNameFirstLine(item.name) || ''
        const freeQty = freeQtyForLineItem(freeItemsMap, item.name)
        const paidQty = Math.max(0, (item.qty || 0) - freeQty)
        const unitPrice = Number(item.price || 0)
        const lineTotal = unitPrice * paidQty
        subtotal += lineTotal
        const allLines = String(item.name || '')
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean)
        const title = escapeHtml(allLines[0] || '-')
        const detailLines = allLines
          .slice(1)
          .filter((line) => !/^BUNDLE_IDS:/i.test(line))
          .map((line) => `<div class="sub">${escapeHtml(line)}</div>`)
          .join('')
        const itemNote = getLineItemNote(item)
        const noteHtml = itemNote
          ? `<div class="sub" style="margin-top:4px;color:#92400e;"><strong>หมายเหตุสินค้า:</strong> ${escapeHtml(itemNote)}</div>`
          : ''
        const qtyText =
          freeQty > 0
            ? `${item.qty} (ชำระ ${paidQty}, แถม ${freeQty})`
            : `${item.qty || 0}`
        return `<tr>
          <td style="text-align:center;border:1px solid #ddd;padding:6px;">${idx + 1}</td>
          <td style="border:1px solid #ddd;padding:6px;font-family:monospace;font-size:8pt;">${escapeHtml(String(productId))}</td>
          <td style="border:1px solid #ddd;padding:6px;">
            <div class="item-title">${title}</div>
            ${detailLines}
            ${noteHtml}
          </td>
          <td style="text-align:center;border:1px solid #ddd;padding:6px;">${escapeHtml(qtyText)}</td>
          <td style="text-align:right;border:1px solid #ddd;padding:6px;">${unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          <td style="text-align:right;border:1px solid #ddd;padding:6px;font-weight:bold;">${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>`
      })
      .join('')

    let discountAmount = 0
    const discountMatch = discountInfo.match(/-(\d+(?:\.\d+)?)B/)
    if (discountMatch) {
      discountAmount = Number(discountMatch[1]) || 0
    } else {
      const amountMatch = discountInfo.match(/Amount:\s*(\d+(?:\.\d+)?)/i)
      if (amountMatch) discountAmount = Number(amountMatch[1]) || 0
      else discountAmount = Number(order.Discount || order.discount || 0) || 0
    }
    const shippingAmount =
      Number(order['Shipping Cost'] || order.ShippingCost || order.Shipping || 0) || 0
    const grandTotal = subtotal - discountAmount + shippingAmount
    const adminOrderNote = getAdminOrderNote(order)
    const adminOrderNoteHtml = adminOrderNote
      ? `<div class="order-note"><strong>หมายเหตุแอดมิน:</strong> ${escapeHtml(adminOrderNote)}</div>`
      : ''

    const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>รายละเอียดออเดอร์ ${escapeHtml(orderId)}</title>
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: 'Sarabun', sans-serif; font-size: 9pt; color: #111; line-height: 1.35; }
        h1 { font-size: 14pt; margin: 0 0 4px 0; color: #047857; }
        .shop { font-size: 8pt; color: #555; margin-bottom: 12px; }
        .meta { font-size: 8pt; margin-bottom: 4px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; background: #f9fafb; }
        .grid div span { display: block; color: #6b7280; font-size: 8pt; }
        .grid div strong { font-size: 10pt; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { background: #047857; color: #fff; padding: 7px 5px; font-size: 8pt; border: 1px solid #047857; }
        .item-title { font-weight: bold; }
        .sub { font-size: 7.5pt; color: #4b5563; margin-top: 2px; }
        .summary { margin-top: 12px; border: 1px solid #a7f3d0; background: #ecfdf5; border-radius: 6px; padding: 10px; max-width: 280px; margin-left: auto; }
        .summary div { display: flex; justify-content: space-between; padding: 3px 0; font-size: 9pt; }
        .summary .total { border-top: 1px solid #6ee7b7; margin-top: 6px; padding-top: 8px; font-weight: bold; font-size: 11pt; color: #047857; }
        .disc { color: #dc2626; }
        .order-note { margin-top: 12px; border: 1px solid #fcd34d; background: #fffbeb; color: #92400e; border-radius: 6px; padding: 9px; font-size: 9pt; }
      </style>
    </head><body>
      <h1>รายละเอียดออเดอร์</h1>
      <div class="shop">${escapeHtml(shop.name || '')}</div>
      <div class="meta"><strong>เลขที่:</strong> ${escapeHtml(orderId)} &nbsp;|&nbsp; <strong>วันที่:</strong> ${orderDateStr}</div>
      <div class="meta"><strong>ลูกค้า:</strong> ${escapeHtml(customerName)}</div>
      ${batchLine}
      <div class="grid">
        <div><span>วิธีการชำระเงิน</span><strong>${escapeHtml(paymentLabel)}</strong></div>
        <div><span>วิธีการรับสินค้า</span><strong>${escapeHtml(shippingLabel)}</strong></div>
      </div>
      <table>
        <thead><tr>
          <th style="width:5%;">#</th>
          <th style="width:12%;">รหัส</th>
          <th style="width:38%;">รายการ</th>
          <th style="width:15%;">จำนวน</th>
          <th style="width:15%;">ราคา/หน่วย</th>
          <th style="width:15%;">รวมสุทธิ</th>
        </tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="6" style="text-align:center;padding:12px;">ไม่มีรายการ</td></tr>'}</tbody>
      </table>
      <div class="summary">
        <div><span>ยอดรวมสินค้า</span><span>฿${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
        <div class="disc"><span>ส่วนลด</span><span>-฿${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
        <div><span>ค่าขนส่ง</span><span>฿${shippingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
        <div class="total"><span>ยอดสุทธิ</span><span>฿${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
      </div>
      ${adminOrderNoteHtml}
    </body></html>`

    openPrintWindow(content)
  },

  // Print Tax Invoice (ใบกำกับภาษี)
  async printTaxInvoice(order, taxData) {
    const [shop, vatRate] = await Promise.all([getShopInfo(), getVatRate()])
    const { taxName, taxId, taxAddress, items, customerPhone } = taxData
    const userEmail = order.UserEmail || order.User || ''
    const userRow = await fetchCustomerShippingProfile(userEmail)
    const recipient = mergeShippingProfileWithOrder(userRow, order)
    const shippingHtml = formatShippingAddressHtml(recipient, { variant: 'tax' })

    let customerPhoneNumber = pickStr(
      taxData.customerPhone,
      recipient.phone,
      order.RecipientPhone,
      order.recipientphone,
      order.Phone,
      order.phone
    )
    if (!customerPhoneNumber) {
      customerPhoneNumber = (await fetchCustomerPhone(userEmail)) || '-'
    }
    
    // Parse discount info to separate coupon discount and promotion discount
    let couponDiscount = 0
    let promotionDiscount = 0
    let freeItemsValue = 0
    const discountInfo = String(order.DiscountInfo || order.discountInfo || "")
    
    // Parse free items from DiscountInfo to calculate subtotal correctly
    const freeItemsMatch = discountInfo.match(/FreeItems:\s*([^|]+)/i)
    const freeItemsMap = new Map()
    if (freeItemsMatch) {
      const freeItemsStr = freeItemsMatch[1].trim()
      freeItemsStr.split(',').forEach(itemStr => {
        const match = itemStr.trim().match(/^(.+?):(\d+)$/)
        if (match) {
          const itemName = match[1].trim()
          const freeQty = parseInt(match[2])
          freeItemsMap.set(itemName, freeQty)
        }
      })
    }
    
    // Calculate subtotal excluding free items
    const subtotal = items.reduce((sum, item) => {
      const freeQty = freeQtyForLineItem(freeItemsMap, item.name)
      const paidQty = Math.max(0, (item.qty || 0) - freeQty)
      return sum + (Number(item.price || 0) * paidQty)
    }, 0)
    
    // Get discount from taxData first (if available), then try to get from order
    // Use separate fields from taxData if available to avoid duplication
    if (taxData.couponDiscount !== undefined || taxData.promotionDiscount !== undefined || taxData.freeItemsValue !== undefined) {
      // Use separate discount fields from taxData
      couponDiscount = Number(taxData.couponDiscount || 0)
      promotionDiscount = Number(taxData.promotionDiscount || 0)
      freeItemsValue = Number(taxData.freeItemsValue || 0)
    } else {
      // Parse from DiscountInfo if taxData doesn't have separate fields
      // Check for coupon code (format: "Code: XXX (-XXB)")
      const couponMatch = discountInfo.match(/Code:.*?\(-(\d+(?:\.\d+)?)B?\)/i)
      if (couponMatch) {
        couponDiscount = parseFloat(couponMatch[1])
      }
      
      // Check for promotion (format: "Promotion: -XXB")
      const promotionMatch = discountInfo.match(/Promotion:\s*-?(\d+(?:\.\d+)?)B?/i)
      if (promotionMatch) {
        promotionDiscount = parseFloat(promotionMatch[1])
      }
      
      // If no specific format found, try to parse from DiscountInfo or Discount column
      if (couponDiscount === 0 && promotionDiscount === 0) {
        const match = discountInfo.match(/-(\d+(?:\.\d+)?)B/)
        if (match) {
          // If DiscountInfo contains "Code:" but no amount, or if it's just a number
          if (discountInfo.includes('Code:')) {
            couponDiscount = parseFloat(match[1])
          } else {
            promotionDiscount = parseFloat(match[1])
          }
        } else {
          // Try to get discount from Amount in DiscountInfo
          const amountMatch = discountInfo.match(/Amount:\s*(\d+(?:\.\d+)?)/i)
          if (amountMatch) {
            if (discountInfo.includes('Code:')) {
              couponDiscount = parseFloat(amountMatch[1])
            } else {
              promotionDiscount = parseFloat(amountMatch[1])
            }
          } else {
            // Fallback to Discount column - check if DiscountInfo has "Code:" to determine type
            const totalDiscount = Number(order.Discount || order.discount || order.discountAmount || 0)
            if (discountInfo.includes('Code:')) {
              couponDiscount = totalDiscount
            } else if (totalDiscount > 0) {
              promotionDiscount = totalDiscount
            }
          }
        }
      }
      
      // Calculate free items value (มูลค่าสินค้าแถม) if not already set
      if (freeItemsValue === 0 && freeItemsMap.size > 0) {
        items.forEach(item => {
          const freeQty = freeQtyForLineItem(freeItemsMap, item.name)
          if (freeQty > 0) {
            freeItemsValue += (Number(item.price || 0) * freeQty)
          }
        })
      }
    }
    
    // Calculate free items value (มูลค่าสินค้าแถม) if not already set from taxData
    // This handles the case where taxData doesn't have separate discount fields
    if (freeItemsValue === 0 && freeItemsMap.size > 0) {
      items.forEach(item => {
        const freeQty = freeQtyForLineItem(freeItemsMap, item.name)
        if (freeQty > 0) {
          freeItemsValue += (Number(item.price || 0) * freeQty)
        }
      })
    }
    
    const discountAmount = couponDiscount + promotionDiscount
    // Try multiple column name variations including 'Shipping Cost' (with space)
    const shipping = Number(
      taxData.shipping || 
      order['Shipping Cost'] || 
      order.ShippingCost || 
      order.shippingCost || 
      order.Shipping || 
      order.shipping || 
      0
    )
    console.log('[printService] Tax Invoice shipping cost:', {
      orderId: order.ID || order.OrderID,
      taxDataShipping: taxData.shipping,
      'Shipping Cost': order['Shipping Cost'],
      ShippingCost: order.ShippingCost,
      Shipping: order.Shipping,
      shippingCost: order.shippingCost,
      shipping: order.shipping,
      finalShipping: shipping,
      allKeys: Object.keys(order)
    })
    const grandTotal = subtotal - discountAmount + shipping
    const { vat, preVat } = calcVatFromTotal(grandTotal, vatRate)

    const itemsHtml = items.map((item, idx) => `
      <tr>
        <td style="text-align:center;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${idx + 1}</td>
        <td style="border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${escapeHtmlMultiline(item.name)}</td>
        <td style="text-align:center;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${item.qty || 0}</td>
        <td style="text-align:right;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${Number(item.price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
        <td style="text-align:right;border-bottom:1px solid #eee;padding:6px 4px;font-size:8pt;">${(Number(item.price || 0) * (item.qty || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr>
    `).join('')

    // Use Timestamp (order date) instead of invoiceDate or current date
    const orderDateStr = formatOrderDate(order.Timestamp || order.CreatedAt || taxData.invoiceDate || order.date)
    const orderId = order.ID || order.OrderID || order.id || ''

    const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tax Invoice</title>
      <style>
        @page{size:A4;margin:12mm}
        body{font-family:'Sarabun',sans-serif;padding:0;line-height:1.3;color:#333;font-size:8pt}
        table{width:100%;border-collapse:collapse;margin-bottom:10px}
        th{background:#047857 !important;color:white !important;border:1px solid #047857;padding:6px 4px;font-size:8pt; -webkit-print-color-adjust: exact; print-color-adjust: exact;}
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:15px;border-bottom:2px solid #047857;padding-bottom:10px}
        .box{border:1px solid #ccc;padding:10px;margin-bottom:15px;border-radius:4px;font-size:8pt}
        td{font-size:8pt;padding:6px 4px}
        @media print {
          img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .signature-container { page-break-inside: avoid; }
          body { margin: 0; padding: 0; }
        }
      </style>
    </head><body>
      <!-- Logo and Header Section -->
      <div style="margin-bottom:15px; border-bottom:2px solid #047857; padding-bottom:10px;">
        <!-- Single Row: Logo (Left) | Company Info (Center-Left) | Invoice Title (Right) -->
        <div style="display:flex; align-items:flex-start; gap:15px;">
          <!-- Left: Logo -->
          <div style="flex-shrink:0;">
            <img src="${LOGO_URL}" style="max-width:160px; max-height:150px; object-fit:contain;" onerror="this.style.display='none';" />
          </div>
          <!-- Center-Left: Company Info (ติดกับโลโก้) -->
          <div style="flex:1;">
            <h2 style="margin:0 0 4px 0; font-size:9pt; font-weight:bold; color:#047857;">${escapeHtml(shop.name)}</h2>
            <div style="font-size:7pt; color:#333; line-height:1.4; margin-bottom:2px;">
              <strong>เลขประจำตัวผู้เสียภาษี:</strong> ${escapeHtml(shop.taxId)}
            </div>
            <div style="font-size:7pt; color:#333; line-height:1.4; margin-bottom:2px;">
              ${escapeHtml(shop.address).replace(/\n/g, '<br>')}
            </div>
            <div style="font-size:7pt; color:#333; margin-top:2px;">
              <strong>โทร.</strong> ${escapeHtml(shop.phone || '')}
            </div>
          </div>
          <!-- Right: Invoice Header -->
          <div style="flex-shrink:0; text-align:right; min-width:200px;">
            <h1 style="margin:0 0 4px 0; font-size:12pt; font-weight:bold; color:#047857; line-height:1.2;">ใบกำกับภาษี / ใบเสร็จรับเงิน</h1>
            <p style="margin:0 0 4px; font-size:7pt; color:#666;">(Tax Invoice / Receipt)</p>
            <p style="margin:0 0 8px; font-size:7pt; color:#333; font-weight:bold;">ต้นฉบับ</p>
            <div style="border:1px solid #ddd; padding:8px; border-radius:4px; background-color:#f9fafb; display:inline-block; text-align:right;">
              <div style="font-size:7pt;"><strong>เลขที่:</strong> INV-${escapeHtml(orderId)}</div>
              <div style="font-size:7pt;"><strong>วันที่:</strong> ${orderDateStr}</div>
            </div>
          </div>
        </div>
      </div>
      <!-- Customer Info Box (separate box below) -->
      <div class="box" style="background-color:#f9fafb; margin-bottom:15px;">
        <h3 style="margin:0 0 8px 0; font-size:8pt; font-weight:bold; color:#047857; border-bottom:1px solid #eee; padding-bottom:4px;">ลูกค้า (Customer)</h3>
        <div>
          <div style="font-weight:bold; margin-bottom:2px; font-size:8pt;">${escapeHtml(taxName || '-')}</div>
          <div style="font-size:7pt; color:#333; line-height:1.4; margin-bottom:2px;">
            <strong>เลขประจำตัวผู้เสียภาษี:</strong> ${escapeHtml(taxId || '-')}
          </div>
          <div style="font-size:7pt; color:#333; line-height:1.4; margin-bottom:2px; white-space:pre-wrap;">
            <strong>ที่อยู่ (ตาม ภ.พ.20)</strong><br>${escapeHtml(taxAddress || '-').replace(/\n/g, '<br>')}
          </div>
          <div style="font-size:7pt; color:#333; margin-top:2px;">
            <strong>โทร.</strong> ${escapeHtml(customerPhoneNumber)}
          </div>
        </div>
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid #ddd;">
          <div style="font-weight:bold; margin-bottom:6px; font-size:7pt; color:#047857;">ที่อยู่จัดส่ง / ผู้รับสินค้า (จากบัญชีผู้ใช้)</div>
          ${shippingHtml}
        </div>
      </div>
        <table style="width:100%; border:1px solid #ddd;">
        <thead>
          <tr>
            <th style="width:5%;text-align:center">#</th>
            <th style="width:40%">รายการ</th>
            <th style="width:10%;text-align:center">จำนวน</th>
            <th style="width:20%;text-align:right">ราคา/หน่วย</th>
            <th style="width:20%;text-align:right">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr><td colspan="4" style="text-align:right;font-weight:bold;padding:6px 4px">รวมเงิน</td><td style="text-align:right;padding:6px 4px">${subtotal.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
          ${couponDiscount > 0 ? `<tr><td colspan="4" style="text-align:right;color:#dc2626;padding:6px 4px">ส่วนลด (โค้ดส่วนลด)</td><td style="text-align:right;color:#dc2626;padding:6px 4px">-${couponDiscount.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>` : ''}
          ${(promotionDiscount > 0 || freeItemsValue > 0) ? `<tr><td colspan="4" style="text-align:right;color:#dc2626;padding:6px 4px">โปรโมชั่น${promotionDiscount > 0 && freeItemsValue > 0 ? ' (ส่วนลด + แถม)' : promotionDiscount > 0 ? '' : ' (แถมสินค้า)'}</td><td style="text-align:right;color:#dc2626;padding:6px 4px">-${(promotionDiscount + freeItemsValue).toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>` : ''}
          <tr><td colspan="4" style="text-align:right;padding:6px 4px">ค่าขนส่ง</td><td style="text-align:right;padding:6px 4px">${shipping.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
          <tr><td colspan="4" style="text-align:right;padding:6px 4px">มูลค่าก่อนภาษี</td><td style="text-align:right;padding:6px 4px">${preVat.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
          <tr><td colspan="4" style="text-align:right;padding:6px 4px">ภาษีมูลค่าเพิ่ม ${vatRate}%</td><td style="text-align:right;padding:6px 4px">${vat.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr>
          <tr style="background-color:#047857 !important; color:white !important; font-weight:bold; font-size:10pt; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            <td colspan="4" style="text-align:right; padding:8px 4px;">ยอดสุทธิ</td>
            <td style="text-align:right; padding:8px 4px;">${grandTotal.toLocaleString(undefined,{minimumFractionDigits:2})} บาท</td>
          </tr>
        </tfoot>
      </table>
      <div style="margin-top:40px; display:flex; justify-content:flex-end; text-align:center; font-size:8pt;" class="signature-container">
        <div style="width:250px; position:relative; min-height:100px;">
          ${renderSignatureHtml(shop)}
          <div style="border-bottom:1px solid #ccc; height:25px; margin-bottom:4px; margin-top:60px; position:relative; z-index:1;"></div>
          <div style="position:relative; margin-top:4px; z-index:1; font-size:7pt;">
            ผู้มีอำนาจลงนาม (Authorized Signature)<br>ในนาม ${escapeHtml(shop.name)}
          </div>
        </div>
      </div>
      <div style="margin-top:30px; padding-top:15px; border-top:1px solid #ddd; text-align:center; font-size:7pt; color:#666;">
        <p style="margin:3px 0;">ใบเสร็จรับเงิน / ใบกำกับภาษีอิเล็กทรอนิกส์</p>
        <p style="margin:3px 0;">(Electronic Receipt / Tax Invoice)</p>
      </div>
    </body></html>`

    openPrintWindow(content)
  }
}
