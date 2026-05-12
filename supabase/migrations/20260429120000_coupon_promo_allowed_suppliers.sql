-- คูปอง/โปรโมชั่น: จำกัด Supplier ที่ใช้ได้ (กรณีตะกร้าหลายซัพโดยไม่มีส่วนกลาง)
-- ค่า NULL = ใช้กฎอัตโนมัติ (ส่วนกลางรับส่วนลดเต็มเมื่อมีสินค้าส่วนกลางในตะกร้า)

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS "AllowedSupplierKeys" jsonb;

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS "AllowedSupplierKeys" jsonb;

COMMENT ON COLUMN public.coupons."AllowedSupplierKeys" IS 'JSON array ของชื่อ/normalized supplier ที่ให้ใช้คูปอง; null = อัตโนมัติ';
COMMENT ON COLUMN public.promotions."AllowedSupplierKeys" IS 'JSON array ของ supplier ที่โปรนี้ใช้ได้เมื่อตะกร้าหลายซัพไม่มีส่วนกลาง; null = อัตโนมัติ';
