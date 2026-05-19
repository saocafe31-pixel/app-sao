import { supabase } from '../utils/supabase'

function mapUserRow(u) {
  const email = String(u.Email || '').trim().toLowerCase()
  if (!email) return null
  const username = String(u.Username || '').trim()
  const userType = String(u.UserType || 'regular').toLowerCase().trim() === 'franchise' ? 'franchise' : 'regular'
  return {
    email,
    username,
    userType,
    optionLabel: `${email}${username ? ` · ${username}` : ''} · ${userType}`
  }
}

/** ค้นหาอีเมล/ชื่อสำหรับ picker (debounce ที่ฝั่ง UI) */
export async function searchCustomersForVisibilityPicker(searchTerm = '', limit = 25) {
  const q = String(searchTerm || '').trim()
  let query = supabase
    .from('users')
    .select('Email, Username, UserType, Role')
    .order('Email', { ascending: true })
    .limit(Math.min(Math.max(limit, 5), 50))

  if (q.length >= 1) {
    const pattern = `%${q.replace(/[%_\\]/g, '')}%`
    query = query.or(`Email.ilike.${pattern},Username.ilike.${pattern}`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message || 'ค้นหาลูกค้าไม่สำเร็จ')
  return (data || []).map(mapUserRow).filter(Boolean)
}

export async function fetchCustomersForVisibilityPicker(limit = 120) {
  const { data, error } = await supabase
    .from('users')
    .select('Email, Username, UserType, Role')
    .order('Email', { ascending: true })
    .limit(limit)

  if (error) throw new Error(error.message || 'โหลดรายชื่อลูกค้าไม่สำเร็จ')

  return (data || []).map(mapUserRow).filter(Boolean)
}

