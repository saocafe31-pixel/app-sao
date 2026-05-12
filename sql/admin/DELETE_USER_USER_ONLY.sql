-- ============================================
-- ลบเฉพาะผู้ใช้ 1 คน (เก็บออเดอร์/ประวัติทั้งหมด)
-- ============================================
-- วิธีใช้:
-- 1) แก้ค่า v_target_email
-- 2) รันทั้งไฟล์ใน Supabase SQL Editor
-- ============================================

DO $$
DECLARE
  v_target_email TEXT := 'user@example.com';
  v_user_id UUID;
  v_user_role TEXT;
  v_deleted_users INTEGER := 0;
BEGIN
  IF v_target_email IS NULL OR BTRIM(v_target_email) = '' THEN
    RAISE EXCEPTION 'กรุณาระบุอีเมลในตัวแปร v_target_email';
  END IF;

  SELECT id, COALESCE("Role", '')
  INTO v_user_id, v_user_role
  FROM public.users
  WHERE LOWER("Email") = LOWER(v_target_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบผู้ใช้อีเมล %', v_target_email;
  END IF;

  IF LOWER(v_user_role) = 'admin' THEN
    RAISE EXCEPTION 'ความปลอดภัย: ไม่อนุญาตลบผู้ใช้ role=admin ด้วยสคริปต์นี้';
  END IF;

  DELETE FROM public.users
  WHERE id = v_user_id;

  GET DIAGNOSTICS v_deleted_users = ROW_COUNT;

  RAISE NOTICE 'ลบผู้ใช้สำเร็จ: email=%, deleted_rows=%', v_target_email, v_deleted_users;
  RAISE NOTICE 'หมายเหตุ: ข้อมูลออเดอร์/ประวัติในตารางอื่นยังคงอยู่ตามที่ต้องการ';
END $$;
