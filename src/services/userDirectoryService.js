import { supabase } from '../utils/supabase'

export async function fetchCustomersForVisibilityPicker(limit = 120) {
  const { data, error } = await supabase
    .from('users')
    .select('Email, Username, UserType, Role')
    .order('Email', { ascending: true })
    .limit(limit)

  if (error) throw new Error(error.message || 'โหลดรายชื่อลูกค้าไม่สำเร็จ')

  return (data || [])
    .map((u) => {
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
    })
    .filter(Boolean)
}

