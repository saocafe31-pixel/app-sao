-- ============================================
-- Admin user management verification table
-- ต้องมีชื่อ + รหัสยืนยันจากตารางนี้ ก่อนเข้าเมนูจัดการผู้ใช้
-- ============================================

CREATE TABLE IF NOT EXISTS public.admin_user_verifications (
  id BIGSERIAL PRIMARY KEY,
  verifier_name TEXT NOT NULL,
  verification_code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_user_verifications_name
  ON public.admin_user_verifications (verifier_name);

CREATE INDEX IF NOT EXISTS idx_admin_user_verifications_active
  ON public.admin_user_verifications (is_active);

COMMENT ON TABLE public.admin_user_verifications
IS 'Whitelist สำหรับยืนยันตัวตนก่อนเข้าเมนูจัดการผู้ใช้ของแอดมิน';

COMMENT ON COLUMN public.admin_user_verifications.verifier_name
IS 'ชื่อผู้ยืนยัน (แอดมินกรอกให้ตรงเพื่อยืนยันสิทธิ์)';

COMMENT ON COLUMN public.admin_user_verifications.verification_code
IS 'รหัสยืนยันจาก backend (เก็บในตารางนี้)';

COMMENT ON COLUMN public.admin_user_verifications.expires_at
IS 'วันหมดอายุของรหัส (ถ้า null = ไม่หมดอายุ)';

ALTER TABLE public.admin_user_verifications DISABLE ROW LEVEL SECURITY;

