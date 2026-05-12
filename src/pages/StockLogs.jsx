import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../utils/supabase'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Swal from 'sweetalert2'
import { parseBundleSelectionIdsFromItemName } from '../utils/orderLineItemDescription'

export default function StockLogs({ user }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [groupByBundleView, setGroupByBundleView] = useState(false)
  const [bundleOrderMap, setBundleOrderMap] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const itemsPerPage = 50

  useEffect(() => {
    fetchLogs()
  }, [currentPage, typeFilter, searchTerm])

  const extractOrderIdFromLog = (log) => {
    const direct = String(log.orderid || log.OrderID || '').trim()
    if (direct) return direct
    const note = String(log.note || log.Note || '')
    const m = note.match(/(ORD[A-Z0-9]+)/i)
    return m ? String(m[1]).trim() : ''
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ids = [...new Set((logs || []).map(extractOrderIdFromLog).filter(Boolean))]
      if (ids.length === 0) {
        if (!cancelled) setBundleOrderMap({})
        return
      }
      try {
        const { data, error } = await supabase
          .from('order')
          .select('OrderID, ProductID, Itemname, Qty')
          .in('OrderID', ids)
        if (error) throw error
        const map = {}
        ;(data || []).forEach((row) => {
          const orderId = String(row.OrderID || '').trim()
          if (!orderId) return
          const itemName = String(row.Itemname || '')
          const bundleParts = parseBundleSelectionIdsFromItemName(itemName)
          if (!bundleParts.length) return
          if (!map[orderId]) map[orderId] = []
          map[orderId].push({
            bundleProductId: String(row.ProductID || '').trim(),
            bundleName: itemName.split('\n')[0] || row.ProductID || '-',
            qty: Number(row.Qty || 0),
            components: bundleParts
          })
        })
        if (!cancelled) setBundleOrderMap(map)
      } catch (e) {
        console.error('Error loading order bundle map:', e)
        if (!cancelled) setBundleOrderMap({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [logs])

  const groupedBundleRows = useMemo(() => {
    const rows = (logs || [])
      .map((log) => {
        const orderId = extractOrderIdFromLog(log)
        if (!orderId) return null
        const bundles = bundleOrderMap[orderId] || []
        if (!bundles.length) return null
        return {
          key: `${orderId}-${log.id}`,
          orderId,
          timestamp: log.timestamp || log.createdat || log.Timestamp || log.CreatedAt,
          note: log.note || log.Note || '-',
          user: log.useremail || log.UserEmail || log.user || '-',
          bundles
        }
      })
      .filter(Boolean)
    return rows
  }, [logs, bundleOrderMap])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('stock_logs')
        .select('*', { count: 'exact' })
        .order('timestamp', { ascending: false })

      // Apply type filter
      if (typeFilter !== 'all') {
        query = query.eq('type', typeFilter)
      }

      // Apply search filter
      if (searchTerm.trim()) {
        query = query.or(`productid.ilike.%${searchTerm}%,productname.ilike.%${searchTerm}%,note.ilike.%${searchTerm}%`)
      }

      // Pagination
      const from = (currentPage - 1) * itemsPerPage
      const to = from + itemsPerPage - 1
      query = query.range(from, to)

      const { data, error, count } = await query

      if (error) {
        console.error('Error fetching stock logs:', error)
        throw error
      }

      setLogs(data || [])
      const total = count || 0
      setTotalCount(total)
      setTotalPages(Math.ceil(total / itemsPerPage))
    } catch (error) {
      console.error('Error fetching stock logs:', error)
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลประวัติสต็อกได้'
      })
    } finally {
      setLoading(false)
    }
  }

  const getTypeLabel = (type, note = '') => {
    const typeMap = {
      'IN': { label: 'รับเข้า', color: 'bg-green-100 text-green-800' },
      'OUT': { label: 'เบิกออก', color: 'bg-red-100 text-red-800' },
      'ADD': { label: 'เพิ่มใหม่', color: 'bg-blue-100 text-blue-800' },
      'EDIT': { label: 'แก้ไข', color: 'bg-yellow-100 text-yellow-800' },
      'ADJUST': { label: 'ปรับปรุง', color: 'bg-purple-100 text-purple-800' },
      'SALE': { label: 'ขาย', color: 'bg-red-100 text-red-800' }
    }
    
    // ถ้า type เป็น 'IN' ให้แสดงเป็น "รับเข้า" เสมอ (ไม่ว่าจะมีคำว่า "ออเดอร์" ใน note หรือไม่)
    if (type === 'IN' || type === 'in') {
      return typeMap['IN']
    }
    
    return typeMap[type] || { label: type, color: 'bg-gray-100 text-gray-800' }
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatQuantity = (quantity, type) => {
    // For OUT type, always show negative (even if quantity is stored as positive)
    // For other types, show positive
    const isOut = type === 'OUT' || type === 'out'
    const sign = isOut ? '-' : '+'
    const color = isOut ? 'text-red-600' : 'text-green-600'
    const displayQuantity = isOut ? Math.abs(quantity) : Math.abs(quantity)
    return (
      <span className={`font-bold ${color}`}>
        {sign}{displayQuantity.toLocaleString()}
      </span>
    )
  }

  const handleRefresh = () => {
    setSearchTerm('')
    setTypeFilter('all')
    setCurrentPage(1)
    fetchLogs()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} />
      <Sidebar user={user} />
      
      <main className="ml-0 md:ml-64 pt-16 pb-20">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">ประวัติเข้าออกสต็อก</h1>
            <p className="text-gray-600">ดูประวัติการเคลื่อนไหวสต็อกทั้งหมด</p>
          </div>

          {/* Search and Filters */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6 sticky top-16 z-40 border-b border-gray-200">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <Icon icon="fa-search" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="ค้นหาตามรหัสสินค้า, ชื่อสินค้า, หรือหมายเหตุ..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      setCurrentPage(1)
                    }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Type Filter */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">ประเภท:</label>
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="IN">รับเข้า</option>
                  <option value="OUT">เบิกออก</option>
                  <option value="ADD">เพิ่มใหม่</option>
                  <option value="EDIT">แก้ไข</option>
                  <option value="ADJUST">ปรับปรุง</option>
                </select>
              </div>

              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center gap-2 font-medium"
              >
                <Icon icon="fa-sync-alt" />
                Refresh
              </button>
              <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm">
                <input
                  type="checkbox"
                  checked={groupByBundleView}
                  onChange={(e) => setGroupByBundleView(e.target.checked)}
                />
                Group-by ชุด/ออเดอร์
              </label>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <LoadingSpinner />
          ) : logs.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Icon icon="fa-inbox" className="text-6xl text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">ไม่พบข้อมูลประวัติสต็อก</p>
            </div>
          ) : groupByBundleView ? (
            <div className="space-y-4">
              {groupedBundleRows.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
                  ไม่พบรายการชุดที่ผูกกับออเดอร์ในหน้านี้
                </div>
              ) : (
                groupedBundleRows.map((g) => (
                  <div key={g.key} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="font-bold text-gray-900">
                        ออเดอร์: <span className="text-emerald-700">{g.orderId}</span>
                      </div>
                      <div className="text-xs text-gray-500">{formatDate(g.timestamp)}</div>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{g.note}</p>
                    <div className="space-y-2">
                      {g.bundles.map((b, idx) => (
                        <div key={`${g.key}-${idx}`} className="rounded border border-emerald-100 bg-emerald-50/40 p-3">
                          <div className="text-sm font-semibold text-gray-800">
                            {b.bundleProductId || '-'} - {b.bundleName} x {b.qty}
                          </div>
                          <div className="mt-1 text-xs text-gray-700">
                            {b.components.map((c, j) => (
                              <span key={`${g.key}-${idx}-${j}`} className="mr-3 inline-block">
                                {c.productId} x {c.qty}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">ผู้ทำรายการ: {g.user}</div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">วันที่/เวลา</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">รหัสสินค้า</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">ชื่อสินค้า</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">ประเภท</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">จำนวน</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">ยอดคงเหลือ</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">หมายเหตุ</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">ผู้ทำรายการ</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">PO ID</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {logs.map((log) => {
                        const logType = (log.type || '').toUpperCase()
                        const note = (log.note || log.Note || '').toLowerCase()
                        
                        // ตรวจสอบว่ามีการคืนสินค้าหรือยกเลิกออเดอร์หรือไม่
                        const isReturn = note.includes('คืนสินค้า') || note.includes('ยกเลิก') || note.includes('return') || note.includes('cancel')
                        
                        // ตรวจสอบว่ามีการขาย/สั่งซื้อหรือไม่ (แต่ไม่ใช่กรณีคืนสินค้า)
                        const isSale = !isReturn && (note.includes('ขาย') || note.includes('สั่งซื้อ') || note.includes('order'))
                        
                        // กำหนด type label
                        let typeInfo
                        if (isReturn && (logType === 'IN' || logType === 'in')) {
          // กรณีคืนสินค้า - แสดงเป็น "รับเข้า"
          typeInfo = getTypeLabel('IN', note)
        } else if (isSale && (logType === 'OUT' || logType === 'out')) {
          // กรณีขาย/สั่งซื้อ - แสดงเป็น "ขาย"
          typeInfo = getTypeLabel('SALE', note)
        } else {
          // กรณีอื่นๆ - ใช้ type ตามปกติ
          typeInfo = getTypeLabel(logType, note)
        }
                        
                        // For OUT type or sales, ensure quantity is displayed as negative
                        // For IN type or returns, ensure quantity is displayed as positive
                        const isOut = (logType === 'OUT' || logType === 'SALE' || isSale) && !isReturn
                        const displayQuantity = isOut ? -Math.abs(log.quantity || 0) : Math.abs(log.quantity || 0)
                        
                        return (
                          <tr key={log.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatDate(log.timestamp || log.createdat || log.Timestamp || log.CreatedAt)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {log.productid || log.ProductID || '-'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {log.productname || log.ProductName || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-bold ${typeInfo.color}`}>
                                {typeInfo.label}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                              {formatQuantity(displayQuantity, isOut ? 'OUT' : logType)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">
                              {(log.balance || log.Balance || 0).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {log.note || log.Note || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {log.useremail || log.UserEmail || log.user || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {log.poid || log.POID || log.orderid || log.OrderID ? (
                                <span className="text-blue-600 font-medium">
                                  {log.poid || log.POID || log.orderid || log.OrderID}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    แสดง {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalCount)} จาก {totalCount.toLocaleString()} รายการ
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Icon icon="fa-chevron-left" />
                    </button>
                    <span className="px-4 py-2 text-sm text-gray-700">
                      หน้า {currentPage} จาก {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Icon icon="fa-chevron-right" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
