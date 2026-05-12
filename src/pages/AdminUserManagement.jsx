import { useEffect, useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import Header from '../components/common/Header'
import Sidebar from '../components/common/Sidebar'
import Icon from '../components/common/Icon'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { supabase } from '../utils/supabase'

const PAGE_SIZE = 1000
const VERIFY_SESSION_KEY = 'admin_user_mgmt_verified'
const VERIFY_SESSION_MS = 15 * 60 * 1000

function parseSafeJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default function AdminUserManagement({ user }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [verifiedName, setVerifiedName] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (user?.role !== 'admin') return
    const raw = localStorage.getItem(VERIFY_SESSION_KEY)
    const session = parseSafeJson(raw)
    if (!session) {
      setLoading(false)
      return
    }
    const isFresh = Date.now() - Number(session.verifiedAt || 0) < VERIFY_SESSION_MS
    if (isFresh) {
      setVerified(true)
      setVerifiedName(session.name || '')
      fetchUsers()
    } else {
      localStorage.removeItem(VERIFY_SESSION_KEY)
      setLoading(false)
    }
  }, [user?.role])

  const filteredUsers = useMemo(() => {
    const q = (searchTerm || '').toLowerCase().trim()
    if (!q) return users
    return users.filter((u) => {
      const email = (u.Email || '').toLowerCase()
      const username = (u.Username || '').toLowerCase()
      const role = (u.Role || '').toLowerCase()
      const userType = (u.UserType || '').toLowerCase()
      const branchId = (u.BranchId || '').toLowerCase()
      return email.includes(q) || username.includes(q) || role.includes(q) || userType.includes(q) || branchId.includes(q)
    })
  }, [users, searchTerm])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      let from = 0
      let allRows = []
      while (true) {
        const to = from + PAGE_SIZE - 1
        const { data, error } = await supabase
          .from('users')
          .select('id, Email, Username, Phone, Role, UserType, BranchId, RegisteredDate')
          .order('RegisteredDate', { ascending: false })
          .range(from, to)

        if (error) throw error
        if (!data || data.length === 0) break

        allRows = allRows.concat(data)
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
      setUsers(allRows)
    } catch (error) {
      console.error('Error fetching users:', error)
      Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: error.message || 'เกิดข้อผิดพลาด' })
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (!nameInput.trim() || !codeInput.trim()) {
      Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณากรอกชื่อและรหัสยืนยัน' })
      return
    }

    setVerifying(true)
    try {
      const { data, error } = await supabase
        .from('admin_user_verifications')
        .select('id, verifier_name, verification_code, is_active, expires_at')
        .ilike('verifier_name', nameInput.trim())
        .eq('verification_code', codeInput.trim())
        .eq('is_active', true)
        .limit(1)

      if (error) throw error
      const row = data?.[0]
      if (!row) {
        Swal.fire({ icon: 'error', title: 'ยืนยันไม่ผ่าน', text: 'ไม่พบชื่อหรือรหัสยืนยันที่ถูกต้อง' })
        return
      }

      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
        Swal.fire({ icon: 'error', title: 'รหัสหมดอายุ', text: 'กรุณาติดต่อผู้ดูแลเพื่อสร้างรหัสใหม่' })
        return
      }

      localStorage.setItem(
        VERIFY_SESSION_KEY,
        JSON.stringify({
          name: row.verifier_name,
          verifiedAt: Date.now()
        })
      )
      setVerified(true)
      setVerifiedName(row.verifier_name)
      setCodeInput('')
      await fetchUsers()
    } catch (error) {
      console.error('Error verifying admin access:', error)
      Swal.fire({ icon: 'error', title: 'ตรวจสอบสิทธิ์ไม่สำเร็จ', text: error.message || 'เกิดข้อผิดพลาด' })
    } finally {
      setVerifying(false)
    }
  }

  const handleReverify = () => {
    localStorage.removeItem(VERIFY_SESSION_KEY)
    setVerified(false)
    setVerifiedName('')
    setUsers([])
  }

  const handleEditUser = async (row) => {
    const result = await Swal.fire({
      title: 'แก้ไขข้อมูลผู้ใช้',
      html: `
        <div class="text-left">
          <label class="block text-sm font-bold text-gray-700 mb-1">Email (อ่านอย่างเดียว)</label>
          <input id="edit-email" class="swal2-input" value="${row.Email || ''}" disabled />
          <label class="block text-sm font-bold text-gray-700 mb-1">ชื่อผู้ใช้</label>
          <input id="edit-username" class="swal2-input" value="${row.Username || ''}" />
          <label class="block text-sm font-bold text-gray-700 mb-1">เบอร์โทร</label>
          <input id="edit-phone" class="swal2-input" value="${row.Phone || ''}" />
          <label class="block text-sm font-bold text-gray-700 mb-1">Role</label>
          <input id="edit-role" class="swal2-input" value="${row.Role || ''}" />
          <label class="block text-sm font-bold text-gray-700 mb-1">UserType</label>
          <input id="edit-usertype" class="swal2-input" value="${row.UserType || ''}" />
          <label class="block text-sm font-bold text-gray-700 mb-1">BranchId</label>
          <input id="edit-branchid" class="swal2-input" value="${row.BranchId || ''}" />
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'บันทึก',
      cancelButtonText: 'ยกเลิก',
      preConfirm: () => ({
        Username: document.getElementById('edit-username')?.value?.trim() || null,
        Phone: document.getElementById('edit-phone')?.value?.trim() || null,
        Role: document.getElementById('edit-role')?.value?.trim() || null,
        UserType: document.getElementById('edit-usertype')?.value?.trim() || null,
        BranchId: document.getElementById('edit-branchid')?.value?.trim() || null
      })
    })

    if (!result.isConfirmed) return
    try {
      const { error } = await supabase.from('users').update(result.value).eq('id', row.id)
      if (error) throw error
      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ' })
      fetchUsers()
    } catch (error) {
      console.error('Error updating user:', error)
      Swal.fire({ icon: 'error', title: 'แก้ไขไม่สำเร็จ', text: error.message || 'เกิดข้อผิดพลาด' })
    }
  }

  const handleDeleteUser = async (row) => {
    if (!row.Email) {
      Swal.fire({ icon: 'error', title: 'ลบไม่ได้', text: 'ไม่พบ Email ของผู้ใช้รายนี้' })
      return
    }

    const result = await Swal.fire({
      title: 'เลือกรูปแบบการลบผู้ใช้',
      html: `<p class="text-left">ผู้ใช้: <strong>${row.Email}</strong></p>`,
      input: 'select',
      inputOptions: {
        user_only: 'ลบเฉพาะผู้ใช้ (เก็บประวัติไว้)',
        full_purge: 'ลบทั้งหมด (ผู้ใช้ + ประวัติ)'
      },
      inputValue: 'user_only',
      inputPlaceholder: 'เลือกรูปแบบการลบ',
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#dc2626'
    })

    if (!result.isConfirmed) return
    const mode = result.value

    const confirm = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบ',
      text: mode === 'full_purge' ? 'จะลบข้อมูลผู้ใช้และประวัติที่เกี่ยวข้องทั้งหมด' : 'จะลบเฉพาะข้อมูลผู้ใช้ในตาราง users',
      showCancelButton: true,
      confirmButtonText: 'ยืนยันลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#dc2626'
    })

    if (!confirm.isConfirmed) return

    try {
      const { data, error } = await supabase.rpc('admin_delete_user', {
        p_email: row.Email,
        p_mode: mode,
        p_dry_run: false
      })
      if (error) throw error

      Swal.fire({
        icon: 'success',
        title: 'ลบสำเร็จ',
        text: `โหมด: ${mode}`,
        footer: `<pre style="text-align:left;white-space:pre-wrap">${JSON.stringify(data?.deleted || {}, null, 2)}</pre>`
      })
      fetchUsers()
    } catch (error) {
      console.error('Error deleting user:', error)
      Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: error.message || 'เกิดข้อผิดพลาด' })
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} cartItemCount={0} onCartClick={() => {}} />
      <div className="flex">
        <Sidebar user={user} />
        <div className="flex-1 ml-0 md:ml-64 pt-16 px-6 pb-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-bold text-gray-900">จัดการผู้ใช้ทั้งหมด (Admin)</h1>
              {verified && (
                <button
                  onClick={handleReverify}
                  className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-sm font-bold"
                >
                  ยืนยันตัวตนใหม่
                </button>
              )}
            </div>

            {!verified ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-2">ยืนยันตัวตนก่อนเข้าเมนูจัดการผู้ใช้</h2>
                <p className="text-sm text-gray-600 mb-4">
                  ต้องมีชื่อและรหัสยืนยันที่สร้างไว้ในตาราง backend `admin_user_verifications`
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="ชื่อผู้ยืนยัน"
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <input
                    type="password"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="รหัสยืนยัน"
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <button
                    onClick={handleVerify}
                    disabled={verifying}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold"
                  >
                    {verifying ? 'กำลังตรวจสอบ...' : 'ยืนยันสิทธิ์'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="text-sm text-gray-700">
                    ยืนยันโดย: <span className="font-bold">{verifiedName}</span> (session 15 นาที)
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="ค้นหา Email / Username / Role / UserType / Branch"
                      className="w-full md:w-96 px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <button
                      onClick={fetchUsers}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-gray-700"
                    >
                      รีเฟรช
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">ชื่อ</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Role</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">UserType</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Branch</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">วันที่สมัคร</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{u.Email || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{u.Username || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{u.Role || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{u.UserType || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{u.BranchId || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {u.RegisteredDate ? new Date(u.RegisteredDate).toLocaleString('th-TH') : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditUser(u)}
                                className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold hover:bg-blue-200 transition"
                              >
                                <Icon icon="fa-edit" className="mr-1" />
                                แก้ไข
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="px-3 py-1.5 bg-red-100 text-red-800 rounded-lg text-xs font-bold hover:bg-red-200 transition"
                              >
                                <Icon icon="fa-trash" className="mr-1" />
                                ลบ
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                            ไม่พบข้อมูลผู้ใช้
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

