-- ============================================
-- ฟังก์ชันกลางสำหรับลบผู้ใช้ด้วย mode
-- mode = user_only  -> ลบเฉพาะ users
-- mode = full_purge -> ลบ users + ออเดอร์/ประวัติในตารางที่เกี่ยวข้อง
-- ============================================
-- วิธีใช้งาน:
-- SELECT public.admin_delete_user('user@example.com', 'user_only');
-- SELECT public.admin_delete_user('user@example.com', 'full_purge');
-- SELECT public.admin_delete_user('user@example.com', 'full_purge', true); -- dry run
-- ============================================

CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_email TEXT,
  p_mode TEXT DEFAULT 'user_only',
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT := LOWER(COALESCE(BTRIM(p_mode), 'user_only'));
  v_email TEXT := LOWER(COALESCE(BTRIM(p_email), ''));
  v_sql TEXT;
  v_rows INTEGER;
  v_found_column TEXT;
  v_col TEXT;
  v_t JSONB;
  v_table_name TEXT;
  v_user_role TEXT;
  v_report JSONB := JSONB_BUILD_OBJECT(
    'email', p_email,
    'mode', v_mode,
    'dry_run', p_dry_run,
    'deleted', '{}'::JSONB
  );
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
BEGIN
  IF v_email = '' THEN
    RAISE EXCEPTION 'p_email is required';
  END IF;

  IF v_mode NOT IN ('user_only', 'full_purge') THEN
    RAISE EXCEPTION 'invalid mode: %, expected user_only or full_purge', p_mode;
  END IF;

  SELECT COALESCE("Role", '')
  INTO v_user_role
  FROM public.users
  WHERE LOWER("Email") = v_email
  LIMIT 1;

  IF LOWER(v_user_role) = 'admin' THEN
    RAISE EXCEPTION 'safety block: refusing to delete admin account';
  END IF;

  IF v_mode = 'full_purge' THEN
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

      IF p_dry_run THEN
        v_sql := format(
          'SELECT COUNT(*)::int FROM public.%I WHERE LOWER(COALESCE(%I::text, '''')) = $1',
          v_table_name,
          v_found_column
        );
        EXECUTE v_sql INTO v_rows USING v_email;
      ELSE
        v_sql := format(
          'DELETE FROM public.%I WHERE LOWER(COALESCE(%I::text, '''')) = $1',
          v_table_name,
          v_found_column
        );
        EXECUTE v_sql USING v_email;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
      END IF;

      v_report := JSONB_SET(
        v_report,
        '{deleted}',
        COALESCE(v_report->'deleted', '{}'::JSONB) || JSONB_BUILD_OBJECT(v_table_name, v_rows)
      );
    END LOOP;
  END IF;

  -- users table (run for both modes)
  IF p_dry_run THEN
    SELECT COUNT(*)::int INTO v_rows
    FROM public.users
    WHERE LOWER("Email") = v_email;
  ELSE
    DELETE FROM public.users
    WHERE LOWER("Email") = v_email;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  END IF;

  v_report := JSONB_SET(
    v_report,
    '{deleted}',
    COALESCE(v_report->'deleted', '{}'::JSONB) || JSONB_BUILD_OBJECT('users', v_rows)
  );

  RETURN v_report;
END;
$$;

COMMENT ON FUNCTION public.admin_delete_user(TEXT, TEXT, BOOLEAN)
IS 'Delete one user by mode: user_only or full_purge. Set p_dry_run=true to preview affected rows.';
