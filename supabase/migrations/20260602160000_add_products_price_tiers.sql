-- ราคาขั้นบันได: JSON array เช่น [{"minQty":1000,"price":3200},{"minQty":2000,"price":6000,"franchisePrice":5800}]
-- minQty = จำนวนหน่วยรวมในบรรทัดตะกร้า, price = ราคาต่อ "ขั้นตอนการสั่ง" (เดียวกับคอลัมน์ Price) เมื่อถึงเกณฑ์
alter table public.products
  add column if not exists "PriceTiers" jsonb default '[]'::jsonb;

comment on column public.products."PriceTiers" is 'Tiered prices: [{minQty, price, franchisePrice?}] — price fields same unit as Price (per stock unit)';
