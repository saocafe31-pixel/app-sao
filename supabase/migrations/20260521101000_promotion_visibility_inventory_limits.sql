-- เพิ่มการจำกัดการมองเห็นโปรตามประเภทลูกค้า และโควตาจำนวนสินค้า X ของโปร
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS "CustomerTypeScope" TEXT NOT NULL DEFAULT 'all';

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS "PromotionStockLimit" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS "PromotionStockUsed" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS chk_promotions_customer_type_scope;
ALTER TABLE public.promotions
  ADD CONSTRAINT chk_promotions_customer_type_scope CHECK (
    "CustomerTypeScope" IN ('all', 'regular', 'franchise')
  );

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS chk_promotions_stock_limit;
ALTER TABLE public.promotions
  ADD CONSTRAINT chk_promotions_stock_limit CHECK ("PromotionStockLimit" >= 0);

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS chk_promotions_stock_used;
ALTER TABLE public.promotions
  ADD CONSTRAINT chk_promotions_stock_used CHECK ("PromotionStockUsed" >= 0);

CREATE INDEX IF NOT EXISTS idx_promotions_customer_type_scope
  ON public.promotions("CustomerTypeScope");

COMMENT ON COLUMN public.promotions."CustomerTypeScope" IS
  'กลุ่มลูกค้าที่เห็น/ใช้โปร: all=ทั้งหมด, regular=ลูกค้าปกติ, franchise=แฟรนไชส์';
COMMENT ON COLUMN public.promotions."PromotionStockLimit" IS
  'จำนวนสินค้า X ที่จัดโปร (0 = ใช้จำนวนคงเหลือสต๊อกจริง)';
COMMENT ON COLUMN public.promotions."PromotionStockUsed" IS
  'จำนวนสินค้า X ที่ถูกใช้กับโปรแล้ว; ถ้าครบ PromotionStockLimit ระบบปิดโปรอัตโนมัติ';
