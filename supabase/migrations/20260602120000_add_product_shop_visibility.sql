-- ปิดรายการสินค้า (ไม่แสดงในร้านหน้าบ้าน) + เลือก UserType ที่เห็นได้
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "ShopHidden" boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "VisibleUserTypes" jsonb DEFAULT '["regular","franchise"]'::jsonb;

COMMENT ON COLUMN public.products."ShopHidden" IS 'true = ไม่แสดงสินค้าในร้าน (ลูกค้าทั่วไปและแฟรนไชส์)';
COMMENT ON COLUMN public.products."VisibleUserTypes" IS 'JSON array: regular, franchise — ใช้เมื่อ ShopHidden = false';
