-- คอลัมน์ FranchiseAvailable ถูกใช้ในแอป (sync กับการเลือกแสดงให้ franchise ใน VisibleUserTypes)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "FranchiseAvailable" boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.products."FranchiseAvailable" IS 'เปิดให้แฟรนไชส์ (สอดคล้องกับ VisibleUserTypes รวม franchise)';
