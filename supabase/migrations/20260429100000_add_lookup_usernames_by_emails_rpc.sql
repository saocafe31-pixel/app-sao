-- ดึง Username จาก public.users ตามรายการอีเมล (เทียบแบบไม่สนตัวพิมพ์/ช่องว่าง)
-- ใช้ SECURITY DEFINER เพื่อให้หน้าแอดมินโหลดชื่อลูกค้าได้แม้ตาราง users จะเปิด RLS
-- และแอปใช้ anon key + custom auth (ไม่มี JWT ตรงกับแถวลูกค้าแต่ละคน)

CREATE OR REPLACE FUNCTION public.lookup_usernames_by_emails(p_emails text[])
RETURNS TABLE (email_norm text, display_username text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (lower(trim(u."Email")))
    lower(trim(u."Email")) AS email_norm,
    nullif(trim(coalesce(u."Username", '')), '') AS display_username
  FROM public.users u
  WHERE nullif(trim(u."Email"), '') IS NOT NULL
    AND lower(trim(u."Email")) IN (
      SELECT lower(trim(e))
      FROM unnest(coalesce(p_emails, array[]::text[])) AS e
      WHERE nullif(trim(e), '') IS NOT NULL
    )
  ORDER BY lower(trim(u."Email")), u.id NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.lookup_usernames_by_emails(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_usernames_by_emails(text[]) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.lookup_usernames_by_emails(text[]) IS
  'คืนอีเมล (normalize เป็นตัวพิมพ์เล็ก) กับ Username จาก users — สำหรับแสดงชื่อในหน้าจัดการออเดอร์';
