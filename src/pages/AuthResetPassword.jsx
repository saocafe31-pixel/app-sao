import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import Icon from '../components/common/Icon'
import Swal from 'sweetalert2'
import { APP_LOGO_URL } from '../utils/constants'
import { hashPassword } from '../utils/passwordHash'
import { isStrongPassword } from '../utils/validation'

export default function AuthResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    const resolveSession = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('[AuthResetPassword] exchange:', exchangeError)
            if (!cancelled) {
              setHasSession(false)
              setReady(true)
            }
            return
          }
          window.history.replaceState({}, '', window.location.pathname)
        }

        const isImplicit = !code && window.location.hash
        if (isImplicit) await new Promise((r) => setTimeout(r, 300))

        const maxRetries = code ? 2 : isImplicit ? 10 : 5
        const retryDelayMs = code ? 400 : 500
        let session = null
        for (let i = 0; i < maxRetries; i++) {
          const { data: { session: s }, error } = await supabase.auth.getSession()
          if (error) console.error('[AuthResetPassword] getSession:', error)
          session = s ?? null
          if (session?.user?.email) break
          if (i < maxRetries - 1) await new Promise((r) => setTimeout(r, retryDelayMs))
        }

        if (window.location.hash) window.history.replaceState({}, '', window.location.pathname)

        if (!cancelled) {
          setHasSession(!!session?.user?.email)
          setEmail(session?.user?.email || '')
          setReady(true)
        }
      } catch (e) {
        console.error('[AuthResetPassword]', e)
        if (!cancelled) {
          setHasSession(false)
          setReady(true)
        }
      }
    }

    resolveSession()
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!password || password !== confirmPassword) {
      Swal.fire({ icon: 'error', title: 'ข้อมูลไม่ตรงกัน', text: 'กรุณากรอกรหัสผ่านและยืนยันให้ตรงกัน', confirmButtonText: 'ตกลง' })
      return
    }
    if (!isStrongPassword(password)) {
      Swal.fire({
        icon: 'error',
        title: 'รหัสผ่านไม่ตรงตามเงื่อนไข',
        text: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว อักษรใหญ่ เล็ก และตัวเลข',
        confirmButtonText: 'ตกลง'
      })
      return
    }

    setSubmitting(true)
    try {
      const { error: authErr } = await supabase.auth.updateUser({ password })
      if (authErr) throw authErr

      const pwdHash = await hashPassword(password)
      const em = (email || '').trim().toLowerCase()

      const { data: row1, error: err1 } = await supabase
        .from('users')
        .update({ Password: pwdHash })
        .eq('Email', em)
        .select('Email')
        .maybeSingle()

      let dbOk = !!row1
      if (!dbOk && !err1) {
        const { data: row2, error: err2 } = await supabase
          .from('users')
          .update({ Password: pwdHash })
          .eq('email', em)
          .select('email')
          .maybeSingle()
        dbOk = !!row2
        if (err2) console.error('[AuthResetPassword] users update (email col):', err2)
      } else if (err1) {
        console.error('[AuthResetPassword] users update (Email col):', err1)
      }

      await supabase.auth.signOut()

      if (!dbOk) {
        Swal.fire({
          icon: 'warning',
          title: 'อัปเดตบางส่วนไม่สำเร็จ',
          html: 'รหัสผ่านในระบบยืนยันตัวตนอัปเดตแล้ว แต่<strong>ยังไม่สามารถอัปเดตรหัสสำหรับเข้าสู่ระบบแบบอีเมล</strong>ได้ (สิทธิ์ฐานข้อมูล) กรุณาติดต่อผู้ดูแลระบบ หรือลองเข้าสู่ระบบด้วย Google',
          confirmButtonText: 'ตกลง'
        }).then(() => navigate('/login'))
        return
      }

      Swal.fire({
        icon: 'success',
        title: 'ตั้งรหัสผ่านใหม่แล้ว',
        text: 'กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#16a34a'
      }).then(() => navigate('/login?reset=success'))
    } catch (err) {
      console.error('[AuthResetPassword] submit:', err)
      Swal.fire({
        icon: 'error',
        title: 'ไม่สำเร็จ',
        text: err.message || 'กรุณาลองใหม่',
        confirmButtonText: 'ตกลง'
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen min-h-dvh flex items-center justify-center gradient-bg px-3 py-6">
        <p className="text-white text-sm">กำลังตรวจสอบลิงก์...</p>
      </div>
    )
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen min-h-dvh flex items-center justify-center gradient-bg px-3 py-6 pt-safe pb-safe">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-2xl p-5 text-center space-y-4">
          <img src={APP_LOGO_URL} alt="" className="w-16 h-16 mx-auto rounded-full object-cover" />
          <h1 className="text-lg font-bold text-gray-800">ลิงก์ไม่ถูกต้องหรือหมดอายุ</h1>
          <p className="text-sm text-gray-600">กรุณากดลิงก์จากอีเมลอีกครั้ง หรือขอรหัสผ่านใหม่จากหน้าเข้าสู่ระบบ</p>
          <Link to="/login" className="inline-block w-full bg-emerald-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-emerald-700">
            กลับไปเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center gradient-bg px-3 py-4 sm:px-4 sm:py-6 pt-safe pb-safe overflow-y-auto">
      <div className="w-full max-w-[320px] sm:max-w-sm min-w-0">
        <div className="text-center mb-3 sm:mb-4">
          <img src={APP_LOGO_URL} alt="SAO CAFE" className="w-[72px] h-[72px] sm:w-20 sm:h-20 mx-auto rounded-full bg-white p-px shadow-lg object-cover mb-2" />
          <h1 className="text-lg sm:text-xl font-bold text-white">ตั้งรหัสผ่านใหม่</h1>
          <p className="text-gray-200 text-xs mt-1 break-all">{email}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl p-4 sm:p-5 space-y-3 sm:space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              <Icon icon="fa-lock" className="mr-1.5 text-gray-500 inline" />
              รหัสผ่านใหม่
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                className="w-full border border-gray-200 rounded-lg p-2.5 sm:p-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none pr-10"
                placeholder="อย่างน้อย 8 ตัว มี A-Z a-z 0-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                <Icon icon={showPassword ? 'fa-eye-slash' : 'fa-eye'} />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              <Icon icon="fa-lock" className="mr-1.5 text-gray-500 inline" />
              ยืนยันรหัสผ่าน
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(ev) => setConfirmPassword(ev.target.value)}
              className="w-full border border-gray-200 rounded-lg p-2.5 sm:p-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              placeholder="กรอกรหัสผ่านอีกครั้ง"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-emerald-600 text-white py-2.5 sm:py-3 rounded-lg font-bold text-sm sm:text-base hover:bg-emerald-700 transition disabled:opacity-60"
          >
            {submitting ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
          </button>
          <p className="text-center text-xs text-gray-500">
            <Link to="/login" className="text-emerald-600 font-semibold hover:underline">กลับไปเข้าสู่ระบบ</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
