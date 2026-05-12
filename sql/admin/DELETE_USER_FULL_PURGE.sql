-- ============================================
-- ลบข้อมูลผู้ใช้ 1 คนแบบทั้งหมด (Full Purge)
-- ลบทั้ง users + ออเดอร์ + ประวัติจากหลายตารางหลังบ้าน
-- ============================================
-- วิธีใช้:
-- 1) แก้ค่า v_target_email
-- 2) รันทั้งไฟล์ใน Supabase SQL Editor
-- ============================================

DO $$
DECLARE
  v_target_email TEXT := 'user@example.com';
  v_user_role TEXT;
  v_sql TEXT;
  v_rows INTEGER;
  v_report JSONB := '{}'::JSONB;
  v_candidates JSONB :=
    '[
      {"table":"notifications","columns":["useremail","UserEmail","email","Email"]},
      {"table":"user_approvals","columns":["useremail","UserEmail","email","Email"]},
      {"table":"user_credits","columns":["useremail","UserEmail","email","Email"]},
      {"table":"credit_transactions","columns":["useremail","UserEmail","email","Email"]},
      {"table":"credit_usage_log","columns":["useremail","UserEmail","email","Email"]},
      {"table":"tax_invoices","columns":["useremail","UserEmail","email","Email"]},
      {"table":"purchase_orders","columns":["useremail","UserEmail","createdby","CreatedBy","email","Email"]},
      {"table":"supplier_pin_locks","columns":["useremail","UserEmail","email","Email"]},
      {"table":"order_packing","columns":["useremail","UserEmail","packed_by","PackedBy","email","Email"]},
      {"table":"order","columns":["UserEmail","useremail","User","user","Email","email"]}
    ]'::JSONB;
  v_t JSONB;
  v_col TEXT;
  v_table_name TEXT;
  v_found_column TEXT;
BEGIN
  IF v_target_email IS NULL OR BTRIM(v_target_email) = '' THEN
    RAISE EXCEPTION 'กรุณาระบุอีเมลในตัวแปร v_target_email';
  END IF;

  SELECT COALESCE("Role", '')
  INTO v_user_role
  FROM public.users
  WHERE LOWER("Email") = LOWER(v_target_email)
  LIMIT 1;

  IF LOWER(v_user_role) = 'admin' THEN
    RAISE EXCEPTION 'ความปลอดภัย: ไม่อนุญาตลบผู้ใช้ role=admin ด้วยสคริปต์นี้';
  END IF;

  FOR v_t IN SELECT * FROM JSONB_ARRAY_ELEMENTS(v_candidates)
  LOOP
    v_table_name := v_t->>'table';
    v_found_column := NULL;

    IF to_regclass(format('public.%I', v_table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    FOR v_col IN SELECT JSONB_ARRAY_ELEMENTS_TEXT(v_t->'columns')
    LOOP
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = v_table_name
          AND column_name = v_col
      ) THEN
        v_found_column := v_col;
        EXIT;
      END IF;
    END LOOP;

    IF v_found_column IS NULL THEN
      CONTINUE;
    END IF;

    v_sql := format(
      'DELETE FROM public.%I WHERE LOWER(COALESCE(%I::text, '''')) = LOWER($1)',
      v_table_name,
      v_found_column
    );

    EXECUTE v_sql USING v_target_email;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_report := v_report || JSONB_BUILD_OBJECT(v_table_name, v_rows);
  END LOOP;

  -- ลบ users เป็นขั้นตอนสุดท้าย
  DELETE FROM public.users
  WHERE LOWER("Email") = LOWER(v_target_email);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_report := v_report || JSONB_BUILD_OBJECT('users', v_rows);

  RAISE NOTICE 'Full purge สำเร็จสำหรับ %', v_target_email;
  RAISE NOTICE 'Delete report: %', v_report;
END $$;
