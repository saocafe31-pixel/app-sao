import { supabase } from '../utils/supabase'

export const taxInvoiceService = {
  // Save tax invoice data
  async saveTaxInvoice(orderId, invoiceData, userEmail, isAdmin = true) {
    try {
      // Check if tax invoice already exists for this order
      const { data: existing } = await supabase
        .from('tax_invoices')
        .select('*')
        .eq('orderid', orderId)
        .maybeSingle()

      const invoiceRecord = {
        orderid: orderId,
        useremail: invoiceData.userEmail || userEmail,
        invoicedate: invoiceData.invoiceDate || new Date().toISOString(),
        taxname: invoiceData.taxName || '',
        taxid: invoiceData.taxId || '',
        taxaddress: invoiceData.taxAddress || '',
        items: JSON.stringify(invoiceData.items || []),
        subtotal: invoiceData.subtotal || 0,
        discount: invoiceData.discount || 0,
        shipping: invoiceData.shipping || 0,
        total: invoiceData.total || 0,
        vat: invoiceData.vat || 0,
        prevat: invoiceData.preVat || 0,
        printcount: existing?.printcount || 0,
        firstprintdate: existing?.firstprintdate || null,
        lastprintdate: existing?.lastprintdate || null,
        printedby: userEmail,
        isadmin: isAdmin
      }

      if (existing) {
        // Update existing record
        const { data, error } = await supabase
          .from('tax_invoices')
          .update(invoiceRecord)
          .eq('orderid', orderId)
          .select()
          .single()

        if (error) throw error
        return { success: true, data, isNewRecord: false }
      } else {
        // Insert new record
        const { data, error } = await supabase
          .from('tax_invoices')
          .insert(invoiceRecord)
          .select()
          .single()

        if (error) throw error
        return { success: true, data, isNewRecord: true, printCount: 0 }
      }
    } catch (error) {
      console.error('Error saving tax invoice:', error)
      throw new Error(error.message || 'ไม่สามารถบันทึกข้อมูลใบกำกับภาษีได้')
    }
  },

  // ลบใบกำกับของออเดอร์ (ใช้หลังแก้ไขออเดอร์ เพื่อให้บันทึกใบกำกับใหม่ตามรายการล่าสุด)
  async deleteTaxInvoiceByOrderId(orderId) {
    try {
      const { error } = await supabase
        .from('tax_invoices')
        .delete()
        .eq('orderid', orderId)
      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Error deleting tax invoice:', error)
      return { success: false, message: error.message }
    }
  },

  /**
   * ดึงชุด orderid ที่มีแถวใน tax_invoices (เรียกครั้งเดียวต่อชุด แทน N ครั้งต่อออเดอร์)
   * @param {string[]} orderIds
   * @returns {Promise<Set<string>>}
   */
  async getRecordedOrderIdSet (orderIds) {
    const out = new Set()
    const ids = [...new Set((orderIds || []).map((id) => String(id || '').trim()).filter(Boolean))]
    const CHUNK = 120
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK)
      const { data, error } = await supabase.from('tax_invoices').select('orderid').in('orderid', slice)
      if (error) {
        console.warn('[taxInvoiceService] getRecordedOrderIdSet chunk failed:', error.message)
        continue
      }
      ;(data || []).forEach((r) => {
        const id = r.orderid ?? r.orderId ?? r.OrderID
        if (id) out.add(String(id).trim())
      })
    }
    return out
  },

  // Get tax invoice by order ID
  async getTaxInvoiceByOrderId(orderId) {
    try {
      const { data, error } = await supabase
        .from('tax_invoices')
        .select('*')
        .eq('orderid', orderId)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        return { success: true, recorded: false }
      }

      return {
        success: true,
        recorded: true,
        taxName: data.taxname || '',
        taxId: data.taxid || '',
        taxAddress: data.taxaddress || '',
        items: data.items ? (typeof data.items === 'string' ? JSON.parse(data.items) : data.items) : [],
        subtotal: data.subtotal || 0,
        discount: data.discount || 0,
        shipping: data.shipping || 0,
        total: data.total || 0,
        vat: data.vat || 0,
        preVat: data.prevat || 0,
        printCount: data.printcount || 0,
        invoiceDate: data.invoicedate
      }
    } catch (error) {
      console.error('Error getting tax invoice:', error)
      return { success: false, message: error.message, recorded: false }
    }
  },

  // Increment print count (for customer only - increments customer_printcount)
  async incrementPrintCount(orderId, userEmail, isAdmin = false) {
    try {
      const { data: existing } = await supabase
        .from('tax_invoices')
        .select('printcount, customer_printcount, firstprintdate, lastprintdate')
        .eq('orderid', orderId)
        .maybeSingle()

      if (!existing) {
        throw new Error('ไม่พบข้อมูลใบกำกับภาษี')
      }

      const now = new Date().toISOString()
      const updateData = {}

      if (isAdmin) {
        // ถ้าเป็นแอดมิน ให้อัปเดต printcount (รวมทั้งหมด)
        const newPrintCount = (existing.printcount || 0) + 1
        updateData.printcount = newPrintCount
        updateData.lastprintdate = now
        if (!existing.firstprintdate) {
          updateData.firstprintdate = now
        }
      } else {
        // ถ้าเป็นลูกค้า ให้อัปเดต customer_printcount (เฉพาะฝั่งลูกค้า)
        const newCustomerPrintCount = (existing.customer_printcount || 0) + 1
        updateData.customer_printcount = newCustomerPrintCount
        updateData.lastprintdate = now
        if (!existing.firstprintdate) {
          updateData.firstprintdate = now
        }
      }

      const { data, error } = await supabase
        .from('tax_invoices')
        .update(updateData)
        .eq('orderid', orderId)
        .select()
        .single()

      if (error) throw error
      
      return { 
        success: true, 
        printCount: isAdmin ? updateData.printcount : updateData.customer_printcount,
        customerPrintCount: updateData.customer_printcount || existing.customer_printcount || 0
      }
    } catch (error) {
      console.error('Error incrementing print count:', error)
      throw new Error(error.message || 'ไม่สามารถอัปเดตจำนวนครั้งที่พิมพ์ได้')
    }
  },

  // Get all tax invoices for a user
  async getUserTaxInvoices(userEmail) {
    try {
      // Try both column name formats
      let { data, error } = await supabase
        .from('tax_invoices')
        .select('*')
        .eq('useremail', userEmail)
        .order('createdat', { ascending: false })

      // If not found, try lowercase
      if (error || !data) {
        const result = await supabase
          .from('tax_invoices')
          .select('*')
          .eq('useremail', userEmail.toLowerCase())
          .order('createdat', { ascending: false })
        data = result.data
        error = result.error
      }

      if (error) throw error

      if (!data || data.length === 0) {
        return { success: true, invoices: [] }
      }

      // Transform data to match expected format
      const invoices = data.map(item => ({
        orderId: item.orderid || item.OrderID || '',
        taxName: item.taxname || item.TaxName || '',
        taxId: item.taxid || item.TaxId || '',
        taxAddress: item.taxaddress || item.TaxAddress || '',
        items: item.items ? (typeof item.items === 'string' ? JSON.parse(item.items) : item.items) : [],
        subtotal: item.subtotal || 0,
        discount: item.discount || 0,
        shipping: item.shipping || 0,
        total: item.total || 0,
        vat: item.vat || 0,
        preVat: item.prevat || item.preVat || 0,
        printCount: item.customer_printcount || item.CustomerPrintCount || item.customerprintcount || 0, // ใช้ customer_printcount สำหรับลูกค้า
        invoiceDate: item.invoicedate || item.InvoiceDate,
        createdAt: item.createdat || item.CreatedAt
      }))

      return { success: true, invoices }
    } catch (error) {
      console.error('Error getting user tax invoices:', error)
      return { success: false, message: error.message, invoices: [] }
    }
  }
}
