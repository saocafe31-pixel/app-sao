import { useState, useEffect } from 'react'
import Swal from 'sweetalert2'
import DateRangeFilter from '../components/common/DateRangeFilter'
import Header from '../components/common/Header'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Sidebar from '../components/common/Sidebar'
import { orderService } from '../services/orderService'
import { productService } from '../services/productService'
import { supabase } from '../utils/supabase'
import { toYmd } from '../utils/datePresets'

function getDefaultDateRange() {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  return { start: toYmd(firstOfMonth), end: toYmd(today) }
}

export default function AdminReports({ user }) {
  const [loading, setLoading] = useState(false)
  const [reportType, setReportType] = useState('sales') // 'sales' or 'stock'
  const [dateRange, setDateRange] = useState(getDefaultDateRange)
  const [showAllDates, setShowAllDates] = useState(false)

  // Sales Report Data
  const [salesReport, setSalesReport] = useState({
    totalSales: 0,
    totalOrders: 0,
    taxInvoiceCount: 0,
    taxInvoiceCustomerCount: 0,
    taxInvoiceTotalAmount: 0,
    taxInvoices: [],
    recentTaxInvoices: [],
    totalCost: 0,
    totalShippingCost: 0,
    profit: 0,
    profitMargin: 0,
    salesByPayment: { credit: 0, transfer: 0 },
    salesByStatus: { pending: 0, completed: 0, cancelled: 0 },
    topProducts: [],
    topCustomers: [],
    dailySales: []
  })

  // Stock Report Data
  const [stockReport, setStockReport] = useState({
    totalStockValue: 0,
    totalStockRetailValue: 0,
    totalStockQuantity: 0,
    totalProducts: 0,
    outOfStockItems: 0,
    lowStockItems: [],
    allProducts: [],
    stockMovements: [],
    stockInValue: 0,
    stockOutValue: 0,
    stockInQuantity: 0,
    stockOutQuantity: 0,
    soldQtyInRange: 0,
    soldValueInRange: 0,
    soldQtyAllTime: 0,
    soldValueAllTime: 0
  })

  useEffect(() => {
    if (reportType === 'sales') {
      fetchSalesReport()
    } else {
      fetchStockReport()
    }
  }, [reportType, dateRange, showAllDates])

  const fetchSalesReport = async () => {
    setLoading(true)
    try {
      const orders = await orderService.getAllOrders()
      
      // Filter orders by date range (หรือทั้งหมดถ้าเลือก "ทั้งหมด")
      const filteredOrders = showAllDates
        ? orders
        : orders.filter(order => {
            const orderDate = order.Timestamp || order.CreatedAt || order.created_at
            if (!orderDate) return false
            const dateStr = new Date(orderDate).toISOString().split('T')[0]
            return dateStr >= dateRange.start && dateStr <= dateRange.end
          })

      // Get completed orders for sales calculations
      const completedOrders = filteredOrders.filter(o => {
        const status = o.Status || o.status || ''
        return status === 'จัดส่งแล้ว'
      })

      // Tax invoices summary (บันทึก/ออกให้ลูกค้า)
      let taxInvoiceCount = 0
      let taxInvoiceCustomerCount = 0
      let taxInvoiceTotalAmount = 0
      let taxInvoices = []
      let recentTaxInvoices = []
      try {
        let taxQuery = supabase
          .from('tax_invoices')
          .select('orderid, useremail, invoicedate, taxname, taxid, total, vat, shipping, createdat')
        if (!showAllDates) {
          const startDate = new Date(dateRange.start + 'T00:00:00').toISOString()
          const endDate = new Date(dateRange.end + 'T23:59:59').toISOString()
          taxQuery = taxQuery.gte('invoicedate', startDate).lte('invoicedate', endDate)
        }
        const { data: taxRows, error: taxError } = await taxQuery
        if (taxError) throw taxError

        const rows = Array.isArray(taxRows) ? taxRows : []
        const uniqueOrderIds = new Set()
        const uniqueCustomerEmails = new Set()
        rows.forEach((row) => {
          const orderId = String(row?.orderid || '').trim()
          const userEmail = String(row?.useremail || '').trim().toLowerCase()
          if (orderId) uniqueOrderIds.add(orderId)
          if (userEmail) uniqueCustomerEmails.add(userEmail)
        })
        taxInvoiceCount = uniqueOrderIds.size
        taxInvoiceCustomerCount = uniqueCustomerEmails.size
        taxInvoices = rows
          .map((row) => ({
            orderId: String(row?.orderid || '').trim(),
            userEmail: String(row?.useremail || '').trim(),
            invoiceDate: row?.invoicedate || null,
            taxName: String(row?.taxname || '').trim(),
            taxId: String(row?.taxid || '').trim(),
            total: Number(row?.total || 0),
            vat: Number(row?.vat || 0),
            shipping: Number(row?.shipping || 0),
            createdAt: row?.createdat || null
          }))
          .sort((a, b) => new Date(b.invoiceDate || b.createdAt || 0) - new Date(a.invoiceDate || a.createdAt || 0))
        taxInvoiceTotalAmount = taxInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0)
        recentTaxInvoices = taxInvoices.slice(0, 20)
      } catch (taxInvoiceError) {
        console.error('Error fetching tax invoices summary:', taxInvoiceError)
      }

      // Calculate total sales
      const totalSales = completedOrders.reduce((sum, order) => {
        return sum + Number(order.Total || order.total || 0)
      }, 0)

      // Calculate total shipping cost
      const totalShippingCost = completedOrders.reduce((sum, order) => {
        return sum + Number(order['Shipping Cost'] || order.ShippingCost || order.Shipping || order.shipping || 0)
      }, 0)

      // Calculate total cost
      let totalCost = 0
      try {
        const allProducts = await productService.getProducts(user, 0, 10000, '')
        const productCostMap = new Map()
        allProducts.forEach(product => {
          if (product.name && product.cost) {
            productCostMap.set(product.name, product.cost)
          }
        })

        completedOrders.forEach(order => {
          const items = order.Items || []
          items.forEach(item => {
            const productName = item.name || ''
            const qty = Number(item.qty || 0)
            const cost = productCostMap.get(productName) || 0
            totalCost += cost * qty
          })
        })
      } catch (error) {
        console.error('Error calculating cost:', error)
      }

      // Calculate profit
      const profit = totalSales - totalCost - totalShippingCost
      const profitMargin = totalSales > 0 ? (profit / totalSales) * 100 : 0

      // Sales by payment method
      const salesByPayment = { credit: 0, transfer: 0 }
      completedOrders.forEach(order => {
        const paymentMethod = (order.PaymentMethod || order.paymentmethod || 'transfer').toLowerCase()
        const total = Number(order.Total || order.total || 0)
        if (paymentMethod === 'credit') {
          salesByPayment.credit += total
        } else {
          salesByPayment.transfer += total
        }
      })

      // Sales by status
      const salesByStatus = { pending: 0, completed: 0, cancelled: 0 }
      filteredOrders.forEach(order => {
        const status = (order.Status || order.status || '').toLowerCase()
        const total = Number(order.Total || order.total || 0)
        if (status.includes('รอ') || status.includes('pending')) {
          salesByStatus.pending += total
        } else if (status.includes('จัดส่ง') || status.includes('completed')) {
          salesByStatus.completed += total
        } else if (status.includes('ยกเลิก') || status.includes('cancelled')) {
          salesByStatus.cancelled += total
        }
      })

      // Top products
      const productSales = new Map()
      completedOrders.forEach(order => {
        const items = order.Items || []
        items.forEach(item => {
          const productName = item.name || ''
          if (productName) {
            const current = productSales.get(productName) || { name: productName, qty: 0, revenue: 0 }
            current.qty += Number(item.qty || 0)
            current.revenue += Number(item.price || 0) * Number(item.qty || 0)
            productSales.set(productName, current)
          }
        })
      })
      const topProducts = Array.from(productSales.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 20)

      // Top customers
      const customerSales = new Map()
      completedOrders.forEach(order => {
        const email = order.UserEmail || order.useremail || ''
        const username = order.Username || order.username || ''
        const customerName = username || email.split('@')[0]
        if (email) {
          const current = customerSales.get(email) || {
            email,
            name: customerName,
            totalSpent: 0,
            orderCount: 0
          }
          current.totalSpent += Number(order.Total || order.total || 0)
          current.orderCount += 1
          customerSales.set(email, current)
        }
      })
      const topCustomers = Array.from(customerSales.values())
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 20)

      // Daily sales breakdown
      const dailySalesMap = new Map()
      completedOrders.forEach(order => {
        const orderDate = new Date(order.Timestamp || order.CreatedAt || order.created_at)
        const dateKey = orderDate.toISOString().split('T')[0]
        const current = dailySalesMap.get(dateKey) || { date: dateKey, sales: 0, orders: 0 }
        current.sales += Number(order.Total || order.total || 0)
        current.orders += 1
        dailySalesMap.set(dateKey, current)
      })
      const dailySales = Array.from(dailySalesMap.values())
        .sort((a, b) => new Date(a.date) - new Date(b.date))

      setSalesReport({
        totalSales,
        totalOrders: filteredOrders.length,
        taxInvoiceCount,
        taxInvoiceCustomerCount,
        taxInvoiceTotalAmount,
        taxInvoices,
        recentTaxInvoices,
        totalCost,
        totalShippingCost,
        profit,
        profitMargin,
        salesByPayment,
        salesByStatus,
        topProducts,
        topCustomers,
        dailySales
      })
    } catch (error) {
      console.error('Error fetching sales report:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลรายงานยอดขายได้'
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchStockReport = async () => {
    setLoading(true)
    try {
      // Get all products
      const allProducts = await productService.getProducts(user, 0, 10000, '')
      
      // Calculate total stock value and quantity
      let totalStockValue = 0
      let totalStockRetailValue = 0
      let totalStockQuantity = 0
      const lowStockItems = []
      let outOfStockItems = 0

      allProducts.forEach(product => {
        const stock = Number(product.stock || 0)
        const cost = Number(product.cost || 0)
        const price = Number(product.price || 0)
        const minStock = Number(product.minStock || 0)
        
        totalStockQuantity += stock
        totalStockValue += stock * cost
        totalStockRetailValue += stock * price
        if (stock <= 0) outOfStockItems += 1

        if (stock <= minStock && stock > 0) {
          lowStockItems.push({
            id: product.id,
            name: product.name,
            stock: stock,
            minStock: minStock,
            cost: cost,
            value: stock * cost
          })
        }
      })

      // Get stock logs (ทั้งหมดหรือตามช่วงวันที่)
      let query = supabase.from('stock_logs').select('*').order('timestamp', { ascending: false })
      if (!showAllDates) {
        const startDate = new Date(dateRange.start + 'T00:00:00').toISOString()
        const endDate = new Date(dateRange.end + 'T23:59:59').toISOString()
        query = query.gte('timestamp', startDate).lte('timestamp', endDate)
      }
      const { data: stockLogsData, error: stockLogsError } = await query

      if (stockLogsError) {
        console.error('Error fetching stock logs:', stockLogsError)
        throw stockLogsError
      }

      const stockLogs = stockLogsData || []

      // Calculate stock movements
      let stockInValue = 0
      let stockOutValue = 0
      let stockInQuantity = 0
      let stockOutQuantity = 0

      // Get product costs for calculating values
      const productCostMap = new Map()
      allProducts.forEach(product => {
        if (product.id && product.cost) {
          productCostMap.set(product.id, product.cost)
        }
      })

      const stockMovements = stockLogs.map(log => {
        const quantity = Number(log.quantity || 0)
        const productId = log.productid || log.ProductID || ''
        const cost = productCostMap.get(productId) || 0
        const value = quantity * cost

        if (log.type === 'IN' || log.type === 'ADD' || log.type === 'FROM_PO') {
          stockInQuantity += quantity
          stockInValue += value
        } else if (log.type === 'OUT' || log.type === 'SALE') {
          stockOutQuantity += quantity
          stockOutValue += value
        }

        return {
          id: log.id,
          productName: log.productname || log.ProductName || '',
          type: log.type,
          quantity: quantity,
          cost: cost,
          value: value,
          note: log.note || '',
          timestamp: log.timestamp || log.created_at || ''
        }
      })

      // Sales performance: selected date range vs all-time
      const allOrders = await orderService.getAllOrders()
      const deliveredOrdersAll = (allOrders || []).filter((o) => {
        const status = String(o.Status || o.status || '')
        return status === 'จัดส่งแล้ว'
      })
      const deliveredOrdersInRange = showAllDates
        ? deliveredOrdersAll
        : deliveredOrdersAll.filter((o) => {
            const orderDate = o.Timestamp || o.CreatedAt || o.created_at
            if (!orderDate) return false
            const dateStr = new Date(orderDate).toISOString().split('T')[0]
            return dateStr >= dateRange.start && dateStr <= dateRange.end
          })

      const soldByNameAll = new Map()
      const soldByNameRange = new Map()
      const accumulateSold = (orders, bucket) => {
        orders.forEach((order) => {
          const items = Array.isArray(order.Items) ? order.Items : []
          items.forEach((item) => {
            const name = String(item.name || item.ProductName || '').trim()
            const qty = Number(item.qty || item.quantity || 0) || 0
            if (!name || qty <= 0) return
            bucket.set(name, (bucket.get(name) || 0) + qty)
          })
        })
      }
      accumulateSold(deliveredOrdersAll, soldByNameAll)
      accumulateSold(deliveredOrdersInRange, soldByNameRange)

      const soldQtyAllTime = Array.from(soldByNameAll.values()).reduce((a, b) => a + b, 0)
      const soldQtyInRange = Array.from(soldByNameRange.values()).reduce((a, b) => a + b, 0)
      const soldValueAllTime = deliveredOrdersAll.reduce((sum, o) => sum + (Number(o.Total || o.total || 0) || 0), 0)
      const soldValueInRange = deliveredOrdersInRange.reduce((sum, o) => sum + (Number(o.Total || o.total || 0) || 0), 0)

      const allProductsDetailed = allProducts.map((product) => {
        const stock = Number(product.stock || 0)
        const cost = Number(product.cost || 0)
        const price = Number(product.price || 0)
        const name = String(product.name || '')
        const soldAll = soldByNameAll.get(name) || 0
        const soldRange = soldByNameRange.get(name) || 0
        return {
          id: product.id,
          name,
          category: product.category || '-',
          supplier: product.supplier || '-',
          unit: product.unit || 'ชิ้น',
          stock,
          soldInRange: soldRange,
          soldAllTime: soldAll,
          cost,
          price,
          stockCostValue: stock * cost,
          stockRetailValue: stock * price
        }
      }).sort((a, b) => b.stockRetailValue - a.stockRetailValue)

      setStockReport({
        totalStockValue,
        totalStockRetailValue,
        totalStockQuantity,
        totalProducts: allProducts.length,
        outOfStockItems,
        lowStockItems: lowStockItems.sort((a, b) => a.stock - b.stock),
        allProducts: allProductsDetailed,
        stockMovements: stockMovements.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
        stockInValue,
        stockOutValue,
        stockInQuantity,
        stockOutQuantity,
        soldQtyInRange,
        soldValueInRange,
        soldQtyAllTime,
        soldValueAllTime
      })
    } catch (error) {
      console.error('Error fetching stock report:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลรายงานสต็อกได้'
      })
    } finally {
      setLoading(false)
    }
  }

  const exportSalesReport = () => {
    // Create CSV content
    let csv = 'รายงานยอดขาย\n'
    csv += `ช่วงเวลา: ${dateRange.start} ถึง ${dateRange.end}\n\n`
    csv += 'สรุปยอดขาย\n'
    csv += `ยอดขายรวม,${salesReport.totalSales}\n`
    csv += `จำนวนออเดอร์,${salesReport.totalOrders}\n`
    csv += `จำนวนใบกำกับภาษีที่บันทึก/ออกให้ลูกค้า,${salesReport.taxInvoiceCount}\n`
    csv += `จำนวนลูกค้าที่ได้รับใบกำกับภาษี,${salesReport.taxInvoiceCustomerCount}\n`
    csv += `ต้นทุนสินค้า,${salesReport.totalCost}\n`
    csv += `ค่าจัดส่ง,${salesReport.totalShippingCost}\n`
    csv += `กำไร,${salesReport.profit}\n`
    csv += `อัตรากำไร,${salesReport.profitMargin.toFixed(2)}%\n\n`
    csv += 'สินค้าขายดี\n'
    csv += 'ชื่อสินค้า,จำนวนที่ขาย,ยอดขาย\n'
    salesReport.topProducts.forEach(product => {
      csv += `${product.name},${product.qty},${product.revenue}\n`
    })
    csv += '\nลูกค้าที่ซื้อเยอะสุด\n'
    csv += 'ชื่อลูกค้า,จำนวนออเดอร์,ยอดซื้อรวม\n'
    salesReport.topCustomers.forEach(customer => {
      csv += `${customer.name},${customer.orderCount},${customer.totalSpent}\n`
    })

    // Download CSV
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `รายงานยอดขาย_${dateRange.start}_${dateRange.end}.csv`
    link.click()
  }

  const exportTaxInvoiceReport = () => {
    let csv = 'รายงานใบกำกับภาษี\n'
    csv += `ช่วงเวลา: ${showAllDates ? 'ทั้งหมด' : `${dateRange.start} ถึง ${dateRange.end}`}\n\n`
    csv += 'สรุป\n'
    csv += `จำนวนใบกำกับภาษีที่บันทึก/ออกให้ลูกค้า,${salesReport.taxInvoiceCount}\n`
    csv += `จำนวนลูกค้าที่ได้รับใบกำกับภาษี,${salesReport.taxInvoiceCustomerCount}\n\n`
    csv += `ยอดรวมที่ออกใบกำกับภาษี,${salesReport.taxInvoiceTotalAmount}\n\n`
    csv += 'รายละเอียดใบกำกับภาษี\n'
    csv += 'วันที่ออกใบกำกับ,เลขออเดอร์,อีเมลลูกค้า,ชื่อลูกค้า(ภาษี),เลขประจำตัวผู้เสียภาษี,ยอดรวม,VAT,ค่าจัดส่ง\n'
    salesReport.taxInvoices.forEach((inv) => {
      const date = inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleString('th-TH') : ''
      csv += `${date},${inv.orderId || ''},${inv.userEmail || ''},${inv.taxName || ''},${inv.taxId || ''},${inv.total || 0},${inv.vat || 0},${inv.shipping || 0}\n`
    })

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `รายงานใบกำกับภาษี_${showAllDates ? 'ทั้งหมด' : `${dateRange.start}_${dateRange.end}`}.csv`
    link.click()
  }

  const exportStockReport = () => {
    // Create CSV content
    let csv = 'รายงานการจัดสต็อก\n'
    csv += `ช่วงเวลา: ${dateRange.start} ถึง ${dateRange.end}\n\n`
    csv += 'สรุปสต็อก\n'
    csv += `มูลค่าสต็อกรวม,${stockReport.totalStockValue}\n`
    csv += `มูลค่าตามราคาขายรวม,${stockReport.totalStockRetailValue}\n`
    csv += `จำนวนสินค้าทั้งหมด,${stockReport.totalStockQuantity}\n`
    csv += `จำนวนรายการสินค้า (SKU),${stockReport.totalProducts}\n`
    csv += `จำนวนสินค้าเหลือ 0,${stockReport.outOfStockItems}\n`
    csv += `ขายได้ในช่วงเวลา (จำนวน),${stockReport.soldQtyInRange}\n`
    csv += `ขายได้ในช่วงเวลา (มูลค่า),${stockReport.soldValueInRange}\n`
    csv += `ขายได้สะสมทั้งหมด (จำนวน),${stockReport.soldQtyAllTime}\n`
    csv += `ขายได้สะสมทั้งหมด (มูลค่า),${stockReport.soldValueAllTime}\n`
    csv += `รับเข้าสต็อก (จำนวน),${stockReport.stockInQuantity}\n`
    csv += `รับเข้าสต็อก (มูลค่า),${stockReport.stockInValue}\n`
    csv += `เบิกออกสต็อก (จำนวน),${stockReport.stockOutQuantity}\n`
    csv += `เบิกออกสต็อก (มูลค่า),${stockReport.stockOutValue}\n\n`
    csv += 'สินค้าสต็อกต่ำ\n'
    csv += 'ชื่อสินค้า,สต็อกปัจจุบัน,สต็อกขั้นต่ำ,มูลค่า\n'
    stockReport.lowStockItems.forEach(item => {
      csv += `${item.name},${item.stock},${item.minStock},${item.value}\n`
    })
    csv += '\nประวัติการเคลื่อนไหวสต็อก\n'
    csv += 'วันที่,ชื่อสินค้า,ประเภท,จำนวน,มูลค่า,หมายเหตุ\n'
    stockReport.stockMovements.forEach(movement => {
      const date = new Date(movement.timestamp).toLocaleDateString('th-TH')
      const type = movement.type === 'IN' ? 'รับเข้า' : movement.type === 'OUT' ? 'เบิกออก' : movement.type
      csv += `${date},${movement.productName},${type},${movement.quantity},${movement.value},${movement.note}\n`
    })
    csv += '\nรายการสินค้าทั้งหมด (สำหรับสรุปคงเหลือ)\n'
    csv += 'รหัสสินค้า,ชื่อสินค้า,หมวดหมู่,ซัพพลายเออร์,คงเหลือ,หน่วย,ขายได้(ช่วงที่เลือก),ขายได้(สะสม),ต้นทุน/หน่วย,ราคาขาย/หน่วย,มูลค่าคงเหลือ(ต้นทุน),มูลค่าคงเหลือ(ราคาขาย)\n'
    stockReport.allProducts.forEach((p) => {
      csv += `${p.id || ''},${p.name || ''},${p.category || ''},${p.supplier || ''},${p.stock},${p.unit || ''},${p.soldInRange},${p.soldAllTime},${p.cost},${p.price},${p.stockCostValue},${p.stockRetailValue}\n`
    })

    // Download CSV
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `รายงานสต็อก_${dateRange.start}_${dateRange.end}.csv`
    link.click()
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      
      <div className="flex">
        <Sidebar user={user} />
        
        <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">รายงาน</h1>
              <div className="flex gap-4">
                <button
                  onClick={() => setReportType('sales')}
                  className={`px-4 py-2 rounded-lg font-semibold transition ${
                    reportType === 'sales'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  รายงานยอดขาย
                </button>
                <button
                  onClick={() => setReportType('stock')}
                  className={`px-4 py-2 rounded-lg font-semibold transition ${
                    reportType === 'stock'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  รายงานสต็อก
                </button>
              </div>
            </div>

            {/* Date Range Selector */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">ช่วงเวลา:</label>
                  <input
                    type="date"
                    value={dateRange.start || ''}
                    onChange={(e) => { setDateRange({ ...dateRange, start: e.target.value }); setShowAllDates(false) }}
                    className="border-2 border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                  <span className="text-gray-500">ถึง</span>
                  <input
                    type="date"
                    value={dateRange.end || ''}
                    onChange={(e) => { setDateRange({ ...dateRange, end: e.target.value }); setShowAllDates(false) }}
                    className="border-2 border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
                <DateRangeFilter
                  layout="buttonsOnly"
                  labelInline
                  start={dateRange.start || ''}
                  end={dateRange.end || ''}
                  onStartChange={(v) => setDateRange((r) => ({ ...r, start: v }))}
                  onEndChange={(v) => setDateRange((r) => ({ ...r, end: v }))}
                  showAllDates={showAllDates}
                  onShowAllDatesChange={setShowAllDates}
                  extraButtons={
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      {reportType === 'sales' && (
                        <button
                          type="button"
                          onClick={exportTaxInvoiceReport}
                          className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition flex items-center gap-2"
                        >
                          <Icon icon="fa-file-invoice-dollar" />
                          <span>ส่งออกรายงานใบกำกับ</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={reportType === 'sales' ? exportSalesReport : exportStockReport}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-2"
                      >
                        <Icon icon="fa-download" />
                        <span>ส่งออก CSV</span>
                      </button>
                    </div>
                  }
                />
              </div>
            </div>

            {/* Sales Report */}
            {reportType === 'sales' && (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">ยอดขายรวม</p>
                        <p className="text-2xl font-semibold text-gray-900">
                          ฿{salesReport.totalSales.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-emerald-100 p-4 rounded-xl">
                        <Icon icon="fa-dollar-sign" className="text-emerald-600 text-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">ใบกำกับภาษีที่ออก</p>
                        <p className="text-2xl font-semibold text-gray-900">
                          {salesReport.taxInvoiceCount.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          ลูกค้า {salesReport.taxInvoiceCustomerCount.toLocaleString()} ราย · ยอดรวม ฿{salesReport.taxInvoiceTotalAmount.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-violet-100 p-4 rounded-xl">
                        <Icon icon="fa-file-invoice-dollar" className="text-violet-600 text-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">จำนวนออเดอร์</p>
                        <p className="text-2xl font-semibold text-gray-900">
                          {salesReport.totalOrders}
                        </p>
                      </div>
                      <div className="bg-blue-100 p-4 rounded-xl">
                        <Icon icon="fa-shopping-bag" className="text-blue-600 text-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">กำไรสุทธิ</p>
                        <p className={`text-2xl font-semibold ${salesReport.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {salesReport.profit >= 0 ? '+' : ''}฿{salesReport.profit.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {salesReport.profitMargin.toFixed(2)}%
                        </p>
                      </div>
                      <div className={`p-4 rounded-xl ${salesReport.profit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                        <Icon icon={salesReport.profit >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'} className={`text-2xl ${salesReport.profit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">ต้นทุนรวม</p>
                        <p className="text-2xl font-semibold text-gray-900">
                          ฿{(salesReport.totalCost + salesReport.totalShippingCost).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          สินค้า + ค่าจัดส่ง
                        </p>
                      </div>
                      <div className="bg-orange-100 p-4 rounded-xl">
                        <Icon icon="fa-calculator" className="text-orange-600 text-2xl" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sales by Payment Method */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">ยอดขายตามช่องทางชำระ</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Icon icon="fa-credit-card" className="text-blue-600 text-xl" />
                          <span className="font-semibold text-gray-700">เครดิต</span>
                        </div>
                        <span className="text-lg font-bold text-blue-600">
                          ฿{salesReport.salesByPayment.credit.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Icon icon="fa-university" className="text-green-600 text-xl" />
                          <span className="font-semibold text-gray-700">โอนเงิน</span>
                        </div>
                        <span className="text-lg font-bold text-green-600">
                          ฿{salesReport.salesByPayment.transfer.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top Products */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">สินค้าขายดี 20 อันดับ</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">อันดับ</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">ชื่อสินค้า</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">จำนวนที่ขาย</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">ยอดขาย</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesReport.topProducts.map((product, index) => (
                          <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">{index + 1}</td>
                            <td className="py-3 px-4 font-medium">{product.name}</td>
                            <td className="py-3 px-4 text-right">{product.qty.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right font-semibold text-emerald-600">
                              ฿{product.revenue.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top Customers */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">ลูกค้าที่ซื้อเยอะสุด 20 อันดับ</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">อันดับ</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">ชื่อลูกค้า</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">จำนวนออเดอร์</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">ยอดซื้อรวม</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesReport.topCustomers.map((customer, index) => (
                          <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">{index + 1}</td>
                            <td className="py-3 px-4 font-medium">{customer.name}</td>
                            <td className="py-3 px-4 text-right">{customer.orderCount}</td>
                            <td className="py-3 px-4 text-right font-semibold text-blue-600">
                              ฿{customer.totalSpent.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Latest Tax Invoices */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-gray-900">รายการใบกำกับภาษีล่าสุด</h2>
                    <span className="text-xs text-gray-500">แสดงล่าสุด {salesReport.recentTaxInvoices.length} รายการ</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">วันที่ออก</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">เลขออเดอร์</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">ลูกค้า</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">เลขผู้เสียภาษี</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">ยอดรวม</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesReport.recentTaxInvoices.length > 0 ? (
                          salesReport.recentTaxInvoices.map((inv, index) => (
                            <tr key={`${inv.orderId || 'row'}-${index}`} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-4 text-sm">
                                {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleString('th-TH') : '-'}
                              </td>
                              <td className="py-3 px-4 font-mono text-sm">{inv.orderId || '-'}</td>
                              <td className="py-3 px-4">
                                <div className="font-medium text-gray-900">{inv.taxName || '-'}</div>
                                <div className="text-xs text-gray-500">{inv.userEmail || '-'}</div>
                              </td>
                              <td className="py-3 px-4 text-sm">{inv.taxId || '-'}</td>
                              <td className="py-3 px-4 text-right font-semibold text-violet-700">
                                ฿{Number(inv.total || 0).toLocaleString()}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="5" className="py-8 text-center text-gray-500">
                              ไม่มีข้อมูลใบกำกับภาษีในช่วงเวลาที่เลือก
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Stock Report */}
            {reportType === 'stock' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white rounded-xl p-5 shadow-sm">
                  <h2 className="text-lg font-bold mb-1">Dashboard สรุปรายงานสต็อก</h2>
                  <p className="text-sm text-slate-100">
                    {showAllDates
                      ? 'กำลังดูภาพรวมทุกช่วงเวลา พร้อมยอดขายสะสมและสถานะคงเหลือปัจจุบัน'
                      : `กำลังดูช่วง ${dateRange.start || '-'} ถึง ${dateRange.end || '-'} พร้อมเทียบยอดขายสะสมทั้งหมด`}
                  </p>
                </div>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">มูลค่าสต็อกรวม</p>
                        <p className="text-2xl font-semibold text-gray-900">
                          ฿{Math.round(stockReport.totalStockValue).toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-indigo-100 p-4 rounded-xl">
                        <Icon icon="fa-warehouse" className="text-indigo-600 text-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">จำนวนคงเหลือทั้งหมด</p>
                        <p className="text-2xl font-semibold text-gray-900">
                          {stockReport.totalStockQuantity.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {stockReport.totalProducts.toLocaleString()} SKU
                        </p>
                      </div>
                      <div className="bg-blue-100 p-4 rounded-xl">
                        <Icon icon="fa-box" className="text-blue-600 text-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">ขายได้ (ช่วงที่เลือก)</p>
                        <p className="text-2xl font-semibold text-green-600">
                          {stockReport.soldQtyInRange.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          ฿{stockReport.soldValueInRange.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-green-100 p-4 rounded-xl">
                        <Icon icon="fa-cash-register" className="text-green-600 text-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">ขายได้สะสมทั้งหมด</p>
                        <p className="text-2xl font-semibold text-red-600">
                          {stockReport.soldQtyAllTime.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          ฿{stockReport.soldValueAllTime.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-red-100 p-4 rounded-xl">
                        <Icon icon="fa-chart-line" className="text-red-600 text-2xl" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">มูลค่าคงเหลือตามราคาขาย</p>
                        <p className="text-2xl font-semibold text-indigo-700">
                          ฿{Math.round(stockReport.totalStockRetailValue).toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-indigo-100 p-4 rounded-xl">
                        <Icon icon="fa-tags" className="text-indigo-600 text-2xl" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">สินค้าใกล้หมด (≤ Min)</p>
                        <p className="text-2xl font-semibold text-amber-600">
                          {stockReport.lowStockItems.length.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-amber-100 p-4 rounded-xl">
                        <Icon icon="fa-exclamation-triangle" className="text-amber-600 text-2xl" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">สินค้าหมดสต็อก</p>
                        <p className="text-2xl font-semibold text-rose-600">
                          {stockReport.outOfStockItems.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-rose-100 p-4 rounded-xl">
                        <Icon icon="fa-box-open" className="text-rose-600 text-2xl" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">เคลื่อนไหวสุทธิ (ช่วงที่เลือก)</p>
                        <p className={`text-2xl font-semibold ${(stockReport.stockInQuantity - stockReport.stockOutQuantity) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {(stockReport.stockInQuantity - stockReport.stockOutQuantity).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          รับเข้า {stockReport.stockInQuantity.toLocaleString()} / เบิกออก {stockReport.stockOutQuantity.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-slate-100 p-4 rounded-xl">
                        <Icon icon="fa-exchange-alt" className="text-slate-700 text-2xl" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Low Stock Items */}
                {stockReport.lowStockItems.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">สินค้าสต็อกต่ำ</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 px-4 font-semibold text-gray-700">ชื่อสินค้า</th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">สต็อกปัจจุบัน</th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">สต็อกขั้นต่ำ</th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">มูลค่า</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockReport.lowStockItems.map((item, index) => (
                            <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-4 font-medium">{item.name}</td>
                              <td className="py-3 px-4 text-right text-red-600 font-semibold">{item.stock}</td>
                              <td className="py-3 px-4 text-right">{item.minStock}</td>
                              <td className="py-3 px-4 text-right">฿{item.value.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">รายการสินค้าทั้งหมด (สรุปพร้อมคงเหลือ/ยอดขาย)</h2>
                  <div className="overflow-x-auto max-h-[32rem]">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">รหัสสินค้า</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">ชื่อสินค้า</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">ซัพพลายเออร์</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">คงเหลือ</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">ขายได้(ช่วงที่เลือก)</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">ขายได้(สะสม)</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">มูลค่าคงเหลือ(ต้นทุน)</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">มูลค่าคงเหลือ(ขาย)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockReport.allProducts.map((p, idx) => (
                          <tr key={`${p.id || p.name}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-2.5 px-4 font-mono text-xs">{p.id || '-'}</td>
                            <td className="py-2.5 px-4">
                              <div className="font-medium text-gray-900">{p.name}</div>
                              <div className="text-xs text-gray-500">{p.category}</div>
                            </td>
                            <td className="py-2.5 px-4 text-sm text-gray-700">{p.supplier || '-'}</td>
                            <td className="py-2.5 px-4 text-right font-semibold">{p.stock.toLocaleString()} {p.unit}</td>
                            <td className="py-2.5 px-4 text-right text-emerald-700">{p.soldInRange.toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right text-blue-700">{p.soldAllTime.toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right">฿{Math.round(p.stockCostValue).toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right font-semibold">฿{Math.round(p.stockRetailValue).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Stock Movements */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">ประวัติการเคลื่อนไหวสต็อก</h2>
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">วันที่</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">ชื่อสินค้า</th>
                          <th className="text-center py-3 px-4 font-semibold text-gray-700">ประเภท</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">จำนวน</th>
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">มูลค่า</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockReport.stockMovements.length > 0 ? (
                          stockReport.stockMovements.map((movement, index) => {
                            const date = new Date(movement.timestamp).toLocaleDateString('th-TH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                            const typeLabel = movement.type === 'IN' ? 'รับเข้า' : 
                                             movement.type === 'OUT' ? 'เบิกออก' : 
                                             movement.type === 'ADD' ? 'เพิ่ม' :
                                             movement.type === 'FROM_PO' ? 'จาก PO' :
                                             movement.type === 'SALE' ? 'ขาย' : movement.type
                            const typeColor = movement.type === 'IN' || movement.type === 'ADD' || movement.type === 'FROM_PO' 
                              ? 'text-green-600' 
                              : 'text-red-600'
                            
                            return (
                              <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="py-3 px-4 text-sm">{date}</td>
                                <td className="py-3 px-4 font-medium">{movement.productName}</td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`font-semibold ${typeColor}`}>{typeLabel}</span>
                                </td>
                                <td className="py-3 px-4 text-right">{movement.quantity.toLocaleString()}</td>
                                <td className="py-3 px-4 text-right">฿{movement.value.toLocaleString()}</td>
                                <td className="py-3 px-4 text-sm text-gray-600">{movement.note}</td>
                              </tr>
                            )
                          })
                        ) : (
                          <tr>
                            <td colSpan="6" className="py-8 text-center text-gray-500">
                              ไม่มีข้อมูลการเคลื่อนไหวสต็อกในช่วงเวลาที่เลือก
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
