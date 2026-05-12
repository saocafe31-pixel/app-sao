/**
 * ดึง Username จาก public.users ตามอีเมล (RPC ข้าม RLS + fallback select)
 * ใช้ร่วมกันระหว่าง orderService, รายงานจัดส่ง CSV
 */
import { supabase } from './supabase'

/** @param {string[]} emails */
export async function fetchUsernameByEmailMap(emails) {
  const map = new Map()
  const unique = [...new Set((emails || []).map((e) => String(e || '').trim()).filter(Boolean))]
  if (unique.length === 0) return map

  const { data: rpcRows, error: rpcError } = await supabase.rpc('lookup_usernames_by_emails', {
    p_emails: unique
  })

  if (!rpcError && rpcRows && Array.isArray(rpcRows)) {
    for (const row of rpcRows) {
      const key = String(row.email_norm ?? row.emailNorm ?? '').trim().toLowerCase()
      const un = String(row.display_username ?? row.displayUsername ?? '').trim()
      if (key && un) map.set(key, un)
    }
  } else if (rpcError && import.meta.env.DEV) {
    console.warn('[customerProfileLookup] lookup_usernames_by_emails:', rpcError.message)
  }

  const stillNeed = unique.filter((e) => !map.has(e.toLowerCase()))
  if (stillNeed.length === 0) return map

  const CHUNK = 120
  for (let i = 0; i < stillNeed.length; i += CHUNK) {
    const chunk = stillNeed.slice(i, i + CHUNK)
    const chunkLower = [...new Set(chunk.map((e) => e.toLowerCase()))]

    let { data, error } = await supabase
      .from('users')
      .select('Email, email, Username, username')
      .in('Email', chunk)

    if (error || !data?.length) {
      const r2 = await supabase
        .from('users')
        .select('Email, email, Username, username')
        .in('email', chunkLower)
      data = r2.data
      error = r2.error
    }

    if (error) {
      console.warn('[customerProfileLookup] select users:', error.message)
      continue
    }
    for (const row of data || []) {
      const em = String(row.Email || row.email || '').trim()
      const un = String(row.Username || row.username || '').trim()
      if (em && un) map.set(em.toLowerCase(), un)
    }
  }
  return map
}

/**
 * ชื่อผู้รับ: Username จาก users (แมปตามอีเมลออเดอร์) → ถ้าไม่มีใช้ Username ในแถว order เมื่อไม่ซ้ำอีเมล
 * @param {object} order
 * @param {Map<string, string>} profileMap key = lower(email)
 */
export function resolveRecipientNameFromUserProfiles(order, profileMap) {
  const email = String(order.UserEmail || order.User || '').trim()
  const key = email.toLowerCase()
  const profile = String((profileMap && profileMap.get(key)) || '').trim()
  if (profile) return profile
  const snapshot = String(order.Username || '').trim()
  if (snapshot && snapshot.toLowerCase() !== key) return snapshot
  return ''
}
