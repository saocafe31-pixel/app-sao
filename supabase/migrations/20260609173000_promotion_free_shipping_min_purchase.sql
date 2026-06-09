-- เพิ่มประเภทโปร: ซื้อครบยอดที่กำหนดแล้วได้ค่าจัดส่งฟรี
-- ใช้ MinPurchase เป็นยอดซื้อขั้นต่ำ และ AllowedSupplierKeys เป็นรายชื่อซัพที่เข้าร่วม
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS chk_promotions_type;

ALTER TABLE public.promotions
  ADD CONSTRAINT chk_promotions_type CHECK (
    "Type" IN (
      'buy_x_get_y',
      'discount_percentage',
      'discount_fixed',
      'target_unit_price',
      'second_item_discount',
      'free_shipping_min_purchase'
    )
  );

-- โปรส่งฟรีเป็นโปรระดับตะกร้า/ซัพ ไม่จำเป็นต้องผูก ProductID
ALTER TABLE public.promotions
  ALTER COLUMN "ProductID" DROP NOT NULL;

COMMENT ON COLUMN public.promotions."Type" IS
  'ประเภทโปร: buy_x_get_y, discount_percentage, discount_fixed, target_unit_price, second_item_discount, free_shipping_min_purchase';
COMMENT ON COLUMN public.promotions."MinPurchase" IS
  'ยอดซื้อขั้นต่ำ (บาท); free_shipping_min_purchase ใช้เป็นยอดขั้นต่ำของซัพที่เข้าร่วม';
COMMENT ON COLUMN public.promotions."AllowedSupplierKeys" IS
  'รายชื่อซัพที่เข้าร่วมโปร/คูปอง; free_shipping_min_purchase ไม่เลือก = ทุกซัพ';
