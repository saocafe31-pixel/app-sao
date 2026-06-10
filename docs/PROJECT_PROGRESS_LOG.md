# PROJECT PROGRESS LOG

บันทึกความคืบหน้าเพื่อให้ผู้พัฒนาและ Agent รู้สถานะล่าสุดของโปรเจค, ทิศทางถัดไป, และรองรับการย้อนกลับงานได้ง่าย

## วิธีใช้งาน (บังคับใช้)

- ทุกครั้งที่มีการเปลี่ยนแปลงโค้ด ให้เพิ่ม 1 รายการในหัวข้อ `## Change Entries`
- ถ้ามีการ merge PR หรือ commit สำคัญ ให้สรุปเพิ่มใน `## Milestones`
- ระบุ `rollback` ทุกครั้ง ว่าสามารถย้อนกลับด้วย commit/tag ไหน
- ทุกการปล่อยงาน (release) ให้บันทึก tag ตาม `docs/RELEASE_CADENCE.md`

## Current Phase

- Phase: `Stabilization + Reporting`
- Updated At: `2026-05-11`
- Owner: `Team + Agent`
- Next Goal:
  - ทำให้รายงานยอดขาย/ใบกำกับภาษีครบและเชื่อมโยงกับการ export
  - คงความถูกต้องของยอดเงินทั้ง flow (Cart -> Checkout -> Order -> Reports)

## Milestones

- [2026-05-09] เพิ่มรายงานใบกำกับภาษีในหน้า `AdminReports` พร้อม export แยก
- [2026-05-09] สร้างเอกสาร workflow และกฎ Agent ระดับโปรเจค
- [2026-05-09] ตั้งมาตรฐาน release cadence + tag format สำหรับ rollback ระดับ release

## Change Entries

### [2026-06-10 11:25] Admin Orders — แก้โหลดออเดอร์ไม่ครบจาก Supabase max-rows cap
- scope: admin-orders, fix
- files: `src/pages/AdminOrders.jsx`, `src/services/orderService.js`
- summary:
  - พบว่าออเดอร์เก่าสุดในตาราง `order` คือเดือน 04/2026 แต่หน้าออเดอร์โหลดย้อนได้แค่เดือน 05/2026
  - สาเหตุ: โค้ดขอ `range` ครั้งละ 2,000 แถว แต่ Supabase (PostgREST `max-rows`) ตัดผลลัพธ์ที่ 1,000 แถวต่อ request — เมื่อได้ 1,000 < 2,000 ระบบเข้าใจผิดว่า "หมดแล้ว" จึงไม่โหลดต่อและไม่แสดงปุ่มโหลดเพิ่ม
  - แก้: ลด `ORDERS_ROW_CHUNK` เป็น 1,000 และให้ `getOrderRowsRange` ส่ง `totalRowCount` (count exact) กลับมา เพื่อให้การตัดสินใจ "ยังเหลือแถวอีกไหม" เทียบจากจำนวนแถวจริงทั้งตาราง ไม่ใช่ขนาด chunk
- impact:
  - user: ค้นหา/กรองหน้าจัดการออเดอร์เห็นข้อมูลครบถึงออเดอร์เก่าสุดในระบบ
  - dev/agent: ห้ามตั้ง chunk เกิน 1,000 และ pagination ใช้ count exact เป็นแหล่งความจริง
- verification:
  - `ReadLints` ไม่มี error ใน 2 ไฟล์ที่แก้
  - `npm run build` ผ่าน
  - manual: ค้นหา email ที่มีออเดอร์เดือน 04/2026 แล้วต้องเจอครบ
- rollback:
  - commit: N/A
  - safe-revert: คืนค่า `ORDERS_ROW_CHUNK = 2000` และลบ `totalRowCount` ออกจาก `getOrderRowsRange` + เงื่อนไข hasMore ใน `AdminOrders.jsx`
- next:
  - หากออเดอร์โตมาก พิจารณา server-side search (RPC/view group ตาม OrderID)

### [2026-06-10 11:15] Admin Orders — ค้นหา/กรองโหลดข้อมูลครบก่อนแสดงผล
- scope: admin-orders, search
- files: `src/pages/AdminOrders.jsx`
- summary:
  - พบว่าหน้า `จัดการออเดอร์` โหลดข้อมูลเป็น chunk ละ 2,000 แถวดิบจากตาราง `order` แล้วค้นหา/กรองจาก state ที่โหลดมาเท่านั้น
  - เพิ่มการโหลด chunk ที่เหลืออัตโนมัติเมื่อผู้ใช้ค้นหา, เปลี่ยนสถานะ, เลือกวันที่, หรือเลือกดูทั้งหมด เพื่อให้ผลลัพธ์ไม่ถูกจำกัดเฉพาะข้อมูลชุดแรก
  - เพิ่มข้อความแจ้งระหว่างโหลดออเดอร์ทั้งหมดสำหรับการค้นหา/กรอง
- impact:
  - user: ค้นหาเลขออเดอร์/ชื่อ/อีเมล และกรองสถานะ/วันที่ได้ครบขึ้น แม้ออเดอร์อยู่ในข้อมูลเก่ากว่าชุดแรก
  - dev/agent: ยังคงโหลดหน้าแรกเร็วด้วย chunking แต่ filter active จะเติมข้อมูลให้ครบก่อนคำนวณผลลัพธ์
- verification:
  - `ReadLints` ใน `src/pages/AdminOrders.jsx`
  - `npm run build`
- rollback:
  - commit: N/A
  - safe-revert: revert การเพิ่ม `loadingAllOrders`, `loadAllRemainingOrders`, auto-load effect, และข้อความสถานะใน `src/pages/AdminOrders.jsx`
- next:
  - หากจำนวนออเดอร์โตมาก ควรพัฒนา server-side search ด้วย RPC/view ที่ group ตาม `OrderID`

### [2026-06-09 17:30] โปรโมชั่น — ซื้อครบยอดแล้วส่งฟรีตามซัพ
- scope: promotions, checkout, schema
- files: `supabase/migrations/20260609173000_promotion_free_shipping_min_purchase.sql`, `src/utils/promotionUtils.js`, `src/utils/promotionUtils.test.js`, `src/pages/AdminPromotions.jsx`, `src/pages/Checkout.jsx`
- summary:
  - เพิ่มประเภทโปร `free_shipping_min_purchase` สำหรับซื้อครบยอดขั้นต่ำแล้วได้รับค่าจัดส่งฟรี
  - หน้าโปรโมชั่นเลือกซัพที่เข้าร่วมได้; ไม่เลือกซัพ = ทุกซัพในตะกร้าเข้าร่วม
  - Checkout ตรวจยอดซื้อขั้นต่ำเฉพาะยอดสินค้าของซัพที่เข้าร่วม และหักค่าส่งเฉพาะซัพนั้นก่อนคำนวณยอดรวม/QR/ยอดชำระแยกซัพ
- impact:
  - user: แอดมินตั้งโปรส่งฟรีแบบระบุซัพได้ และลูกค้าเห็นยอดค่าส่งหลังหักโปรถูกต้องใน Checkout
  - dev/agent: โปรส่งฟรีถูกแยกจากส่วนลดสินค้าเดิม ไม่ไปรบกวนการ split promotion discount ของโปรประเภทอื่น
- verification:
  - `npm run test:run -- src/utils/promotionUtils.test.js`
  - `npm run build`
  - `ReadLints` ในไฟล์ที่แก้
- rollback:
  - commit: N/A
  - safe-revert: revert ไฟล์ที่ระบุด้านบน; ถ้ารัน migration แล้วให้คืน constraint `chk_promotions_type` โดยลบ `free_shipping_min_purchase` และตั้ง `ProductID` กลับเป็น NOT NULL หากไม่มีโปรระดับตะกร้าที่ต้องใช้ ProductID ว่าง
- next:
  - รัน migration `20260609173000_promotion_free_shipping_min_purchase.sql` บน Supabase ก่อนเปิดใช้งานจริง

### [2026-05-30] Tax Invoice — แก้ลายเซ็นไม่ขึ้นในหน้าพิมพ์
- scope: tax-invoice, print
- files: `src/services/printService.js`, `src/utils/constants.js`
- summary:
  - พบว่า URL ลายเซ็น default เดิมจาก `storage.googleapis.com` ตอบ `403 Forbidden` ทำให้ `<img>` โหลดไม่ได้และถูกซ่อน
  - เอา URL default ที่เสียออก เพื่อไม่ fallback ไปใช้รูปที่โหลดไม่ได้
  - ปรับ `openPrintWindow` ให้รอรูปในเอกสารพิมพ์โหลดเสร็จ (หรือ timeout 2.5s) ก่อนเรียก `print()` ลดปัญหาลายเซ็น/โลโก้ยังโหลดไม่ทัน
  - render รูปลายเซ็นเฉพาะเมื่อมี `shop.signature` จริงจาก settings
- impact: ถ้าตั้งค่าลายเซ็น URL ที่ใช้งานได้ ใบกำกับภาษีจะแสดงลายเซ็นก่อนเปิด print dialog; ถ้ายังไม่ได้ตั้งค่าจะไม่แสดงรูปเสีย
- verification: ตรวจ default signature URL ได้ `403 Forbidden`; `npm run build`; `ReadLints` ไม่มี error
- rollback: revert `src/services/printService.js` และ `src/utils/constants.js`
- next step: ตั้งค่า/อัปโหลดลายเซ็นใหม่ในหน้า `ตั้งค่าทั่วไป` เพื่อให้ `settings.shop.signature` มี URL ที่โหลดได้

### [2026-05-27] Admin Orders — แก้ส่วนลดหลอกจาก Batch ID
- scope: admin-orders, display
- files: `src/pages/AdminOrders.jsx`
- summary:
  - เพิ่ม parser ส่วนลดที่อ่านเฉพาะ `Code:`, `Promotion:`, `ส่วนลด:`, `Discount:`, หรือ `Amount:` แบบมี label
  - เลิกใช้ regex กว้าง `-(ตัวเลข)B` ที่ไปจับ `Batch: ...-7BYKTE` แล้วแสดงเป็นส่วนลดผิด
- impact: หน้าออเดอร์/รายละเอียด/ใบกำกับภาษีไม่แสดงส่วนลดหลอกจากรหัส Batch; ออเดอร์ `BATCH1779854301697-7BYKTE` จะไม่ขึ้นส่วนลด `7` บาทถ้า DB ไม่มีส่วนลดจริง
- verification: ตรวจ INSERT ที่มี `Discount=0` และ `DiscountInfo` ไม่มี `Promotion:`/`Code:`; `npm run build`; `ReadLints` ไม่มี error ใน `AdminOrders.jsx`
- rollback: revert การเปลี่ยน `parseOrderDiscountBreakdown` ใน `src/pages/AdminOrders.jsx`
- next step: —

### [2026-05-21] โปรโมชั่น — จำกัดผู้เห็นโปรตามประเภทลูกค้า + โควตาจำนวนสินค้า
- scope: promotions, checkout, schema
- files: `supabase/migrations/20260521101000_promotion_visibility_inventory_limits.sql`, `src/utils/promotionUtils.js`, `src/utils/promotionUtils.test.js`, `src/pages/AdminPromotions.jsx`, `src/pages/Checkout.jsx`, `src/services/orderService.js`
- summary:
  - เพิ่ม `CustomerTypeScope` ให้โปรเลือกได้ว่าเห็น/ใช้ได้สำหรับ `ทั้งหมด`, `ลูกค้าปกติ`, หรือ `แฟรนไชส์`
  - เพิ่ม `PromotionStockLimit` และ `PromotionStockUsed` สำหรับโควตาจำนวนสินค้า X ที่จัดโปร; ถ้า limit = 0 จะอิงสต๊อกจริง
  - Checkout จำกัดจำนวนสินค้าที่ได้โปรตามโควตาที่เหลือ และส่ง `appliedStockQty` ให้ order service นับหลังสั่งซื้อ
  - เมื่อ `PromotionStockUsed` ครบ `PromotionStockLimit` ระบบอัปเดตโปรเป็น `inactive` อัตโนมัติ
- impact: admin คุมกลุ่มลูกค้าที่เห็นโปรและจำนวนสินค้าที่ร่วมโปรได้; ลดความเสี่ยงโปรเกินโควตาหรือแสดงผิดกลุ่ม
- verification: `npm run test -- --run src/utils/promotionUtils.test.js`; `npm run build`; `ReadLints` ไม่มี error ในไฟล์ที่แก้
- rollback: revert commit; ถ้ารัน migration แล้วให้ drop columns/constraints/index ของ `CustomerTypeScope`, `PromotionStockLimit`, `PromotionStockUsed`
- next step: รัน migration `20260521101000_promotion_visibility_inventory_limits.sql` บน Supabase ก่อนใช้งานจริง

### [2026-05-19] โปรโมชั่น — ชิ้นที่ 2 ลดบาท/% + จำกัดการใช้ต่อคน/รวม
- scope: promotions, checkout
- files: `supabase/migrations/20260519130000_promotion_second_item_usage_limits.sql`, `src/utils/promotionUtils.js`, `src/utils/promotionUtils.test.js`, `src/pages/AdminPromotions.jsx`, `src/pages/Checkout.jsx`, `src/services/orderService.js`
- summary:
  - ประเภทใหม่ `second_item_discount` (ชิ้นที่ 2,4,6… ลด % หรือบาท/ชิ้น)
  - ฟิลด์ `UsageLimit` (ต่อคน), `TotalUsageLimit` (รวม), นับ `UsageCount` ตอนสั่งซื้อ
  - Checkout ตรวจขีดจำกัดก่อนใช้โปร; บันทึก `PromoIds:` ใน DiscountInfo สำหรับนับต่อคน
- impact: admin ตั้งโปรและขีดจำกัดได้; ลูกค้าที่เกินโควตาไม่ได้ส่วนลดโปรนั้น
- verification: `npm run test -- --run src/utils/promotionUtils.test.js`; `npm run build`; รัน migration บน Supabase; ทดสอบสร้างโปรชิ้นที่ 2 + จำกัดครั้ง
- rollback: revert commit; รัน migration ย้อน constraint/columns ถ้าจำเป็น
- next step: รัน migration `20260519130000` (และ `20260519120000` ถ้ายังไม่รัน) บน Supabase

### [2026-05-19] แก้หัวตารางสต็อก/ออเดอร์ — หัวคอลัมอยู่ด้านบนถูกต้อง
- scope: ui
- files: `src/utils/adminPageLayout.js`, `src/pages/StockManagement.jsx`, `src/pages/AdminOrders.jsx`
- summary:
  - เอา `sticky top-16` ออกจาก `<thead>` (ชนกับ `overflow-x-auto` ทำให้หัวตารางไปโผล่ใต้แถวแรก)
  - ใช้หัวตารางปกติ `ADMIN_TABLE_HEAD`; ปรับ padding คอลัมน์ออเดอร์ให้ตรงกับ `<th>`
- impact: user: หัวคอลัม (รูป, รหัสสินค้า, ออเดอร์, ลูกค้า ฯลฯ) อยู่เหนือข้อมูลทุกแถว
- verification: `npm run build`; เปิด `/admin/stock` และ `/admin/orders` ตรวจหัวตารางอยู่บนสุดของตาราง
- rollback: คืน `ADMIN_TABLE_HEAD_STICKY` บน thead ใน commit ก่อนหน้า
- next step: —

### [2026-05-19] Layout สต็อก/ออเดอร์ — เลื่อนหน้าแนวตั้งตามปกติ (ไม่ฟิกกรอบสูง)
- scope: ui
- files: `src/utils/adminPageLayout.js`, `src/pages/StockManagement.jsx`, `src/pages/AdminOrders.jsx`
- summary:
  - ยกเลิก `h-dvh` + ตารางเลื่อนในกรอบสูงคงที่ — กลับ `min-h-screen` เลื่อนทั้งหน้าได้
  - คงการจัดแนวนอน: `overflow-x-auto` ที่ตาราง, ปุ่ม/ฟิลเตอร์กระชับ, หัวตาราง `sticky top-16`
- impact: user: รู้สึกจอไม่สั้น; เลื่อนลงดูรายการได้เหมือนเดิม
- verification: `npm run build`; เลื่อนหน้าสต็อก/ออเดอร์ลงได้เต็มความยาว
- rollback: คืน `adminPageLayout` แบบ `h-dvh` ใน commit ก่อนหน้า
- next step: —

### [2026-05-19] Layout จัดการสต็อก/ออเดอร์ — พอดีจอ ตารางเลื่อนในพื้นที่เนื้อหา (superseded)
- scope: ui
- files: `src/utils/adminPageLayout.js`, `src/pages/StockManagement.jsx`, `src/pages/AdminOrders.jsx`
- summary: ทดลอง `h-dvh` — ผู้ใช้ขอเลื่อนหน้าแนวตั้งแบบเดิม (ดู entry ถัดไป)
- impact: —
- verification: —
- rollback: —
- next step: —

### [2026-05-19] จัดการสต็อก — modal พอดีจอ + ค้นหาอีเมลจำกัดการมองเห็น; แก้ modal ออเดอร์
- scope: ui/feature
- files: `src/utils/adminModalLayout.js`, `src/components/admin/AllowedViewerEmailPicker.jsx`, `src/services/userDirectoryService.js`, `src/pages/StockManagement.jsx`, `src/pages/AdminOrders.jsx`
- summary:
  - มาตรฐาน overlay modal แอดมิน (`top-16`, `z-[70]`) หัว/เนื้อหาเลื่อน/ปุ่มคงที่
  - หน้าเพิ่ม/แก้ไขสินค้า: picker ค้นหาอีเมลจากตาราง users + แท็กลบ + textarea วางหลายเมล
  - modal แก้ไขออเดอร์ + ใบกำกับภาษี: จำกัดพื้นที่ใต้ Header
  - แก้ margin ข้อความ CSV ที่ดึงปุ่มด้านบนทับกัน (`-mt-4` → `mt-1`)
- impact: user: modal ไม่ทับแถบ SAO CAFE; เลือกอีเมลเห็นเฉพาะสินค้าได้ง่ายขึ้น
- verification: `npm run build`; ทดสอบเพิ่มสินค้า → จำกัดอีเมล → พิมพ์ค้นหา → เลือกจากรายการ
- rollback: revert ไฟล์ด้านบน
- next step: นำ `adminModalLayout` ไปใช้กับ modal หน้าอื่นที่เหลือเมื่อมีเวลา

### [2026-05-19] ปรับขนาด modal เพิ่ม/แก้ไขโปรโมชั่นไม่ล้นจอ / ไม่ทับ Header
- scope: ui
- files: `src/pages/AdminPromotions.jsx`
- summary:
  - overlay เริ่มใต้ Header (`top-16`), `z-[70]` (สูงกว่า Header `z-[60]`)
  - จำกัดความสูง modal (~520px), เลื่อนเฉพาะเนื้อหาฟอร์ม ส่วนหัว/ปุ่มคงที่
  - ลดความกว้าง `max-w-md`, ช่องกรอกกระชับ, grid จำนวนซื้อ/แถม วันที่ ยอดขั้นต่ำ/สถานะ
  - บล็อก Supplier ยุบใน `<details>`
- impact: user: modal ไม่ทับแถบ SAO CAFE ด้านบน; ฟังก์ชันเดิมไม่เปลี่ยน
- verification: เปิดหน้าจัดการโปรโมชั่น → เพิ่มโปร → หัว modal อยู่ใต้ Header ชัดเจน
- rollback: revert `src/pages/AdminPromotions.jsx` (ส่วน Promotion Modal)
- next step: —

### [2026-05-19] แก้ logic โปรโมชั่นให้ตรงหน้าชำระเงิน + ปรับ UI จัดการโปรโมชั่น
- scope: fix/feature
- files: `src/utils/promotionUtils.js`, `src/utils/promotionUtils.test.js`, `src/pages/Checkout.jsx`, `src/pages/AdminPromotions.jsx`, `supabase/migrations/20260519120000_promotion_target_unit_price.sql`
- summary:
  - ส่วนลดจำนวนเงิน: หัก **ต่อชิ้น** (× จำนวนที่ซื้อ) ไม่ใช่ครั้งเดียวต่อออเดอร์
  - เพิ่มประเภท **ราคาพิเศษต่อชิ้น** (`target_unit_price`) สำหรับเคส “ลดเหลือ 290”
  - วันสิ้นสุดนับถึงสิ้นวัน; ฟอร์มแอดมินมีคำอธิบายและ preview ราคาสินค้า
- impact:
  - user: โปรที่ตั้งในแอดมินตรงกับที่เห็นตอนชำระเงินมากขึ้น; ต้องเปิดสถานะ «ใช้งาน» และเลือกประเภทให้ตรงความหมาย
  - dev/agent: logic รวมใน `promotionUtils` ใช้ร่วม Checkout/Admin
- verification:
  - `npm run build` + `vitest src/utils/promotionUtils.test.js` ผ่าน
  - ทดสอบ: สร้างโปร target_unit_price 290 บาท สินค้า A002 → ใส่ตะกร้า → หน้า Checkout แสดงส่วนลดตามราคาปกติ−290
  - รัน migration `20260519120000_promotion_target_unit_price.sql` บน Supabase ก่อนบันทึกประเภทใหม่
- rollback:
  - revert ไฟล์ด้านบน; ลบ type จาก CHECK constraint ถ้าจำเป็น
- next:
  - แก้โปรเดิม «กาแฟดอยชาว ลดเหลือ 290» เป็นประเภทราคาพิเศษ 290 บาท และเปิดใช้งาน

### [2026-05-18] พิมพ์รายละเอียดออเดอร์จากโมดัล Admin Orders
- scope: feature
- files: `src/services/printService.js`, `src/pages/AdminOrders.jsx`
- summary:
  - เพิ่ม `printService.printOrderDetail` สำหรับพิมพ์รายการสินค้า/ยอดสรุปตรงกับโมดัลรายละเอียด
  - โมดัลรายละเอียดออเดอร์มีปุ่ม «พิมพ์» (SweetAlert deny)
- impact:
  - user: พิมพ์รายละเอียดออเดอร์จากหน้าจัดการออเดอร์ได้โดยไม่ต้องออกใบเสร็จเต็มรูปแบบ
- verification:
  - `npm run build` ผ่าน
  - เปิดรายละเอียดออเดอร์ → กดพิมพ์ → ตรวจหน้าพิมพ์มีรายการและยอดสุทธิ
- rollback:
  - safe-revert: revert 2 ไฟล์ด้านบน
- next:
  - ไม่มี

### [2026-05-18] Admin reports, dashboard, stock supplier views
- scope: feature
- files: `src/pages/AdminReports.jsx`, `src/pages/AdminDashboard.jsx`, `src/pages/StockManagement.jsx`, `src/pages/FranchiseStockManagement.jsx`
- summary:
  - AdminReports: scope ออเดอร์ทั้งหมดในช่วง (ไม่นับยกเลิก) vs จัดส่งแล้ว, จัดอันดับสินค้าขายดี qty/revenue, ปุ่มพิมพ์ใบกำกับภาษี
  - AdminDashboard: การ์ดสินค้าขายดี/ลูกค้าพร้อมแถบเปรียบเทียบ + toggle จำนวนขาย/ยอดขาย (ยังกรองเฉพาะจัดส่งแล้ว)
  - StockManagement + FranchiseStockManagement: มุมมอง ทั้งหมด/ตามซัพพลาย, การ์ดซัพ → drill-down ตาราง, ค้นหาแยกบริบท; แฟรนไชส์ reset โหมดเมื่อสลับแท็บ import/สั่งซัพอื่น
- impact:
  - user: จัดการสต็อกและดูรายงานตามซัพพลายได้ง่ายขึ้น; รายงานยอดขายเลือก scope ได้ชัดเจน
  - dev/agent: pattern `STOCK_VIEW_*` / `applySalesOrderScope` ใช้ซ้ำได้ข้ามหน้า admin/franchise
- verification:
  - `npm run build` ผ่าน
  - ทดสอบ: Admin Reports สลับ scope + rank สินค้า; พิมพ์ใบกำกับ; Stock/Franchise สลับ ทั้งหมด/ตามซัพ → เลือกซัพ → ตาราง; แฟรนไชส์สลับแท็บ import แล้วกลับ stock โหมดทั้งหมด
- rollback:
  - commit: N/A
  - safe-revert: revert 4 ไฟล์ด้านบน
- next:
  - smoke-test บน staging กับข้อมูลออเดอร์/ซัพจริง

> รูปแบบที่ต้องใช้ทุกครั้ง:

```md
### [YYYY-MM-DD HH:mm] <short-title>
- scope: <feature/fix/refactor/docs/chore>
- files: `<path1>`, `<path2>`
- summary:
  - <เปลี่ยนอะไร>
  - <ทำไมต้องเปลี่ยน>
- impact:
  - user: <ผลต่อผู้ใช้>
  - dev/agent: <ผลต่อทีมพัฒนา/Agent>
- verification:
  - <lint/test/manual check>
- rollback:
  - commit: <hash หรือ N/A>
  - safe-revert: <วิธีย้อนกลับแบบสั้น>
- next:
  - <งานถัดไปที่ควรทำ>
```

### [2026-05-11] รายงานยอดขาย: โหมดทุกสถานะไม่นับออเดอร์ยกเลิก
- scope: fix
- files: `src/pages/AdminReports.jsx`, `docs/PROJECT_WORKFLOW_REPORT.md`
- summary:
  - เพิ่ม `isCancelledOrder()` (สถานะมีคำว่า ยกเลิก หรือ cancelled) และกรองออกจากชุด `reportOrders` เมื่อ `salesOrderScope === 'all'`
  - อัปเดตข้อความ UI / CSV ให้สอดคล้อง
- impact:
  - user: ยอดขาย/กำไร/สินค้าขายดีในโหมดทุกสถานะไม่รวมออเดอร์ยกเลิก
  - dev: เกณฑ์ยกเลิกต้องตรงกับที่ใช้ใน bucketing `salesByStatus`
- verification:
  - lints `AdminReports.jsx`
- rollback:
  - commit: N/A
  - safe-revert: ลบ `isCancelledOrder` และใช้ `filteredOrders` แทน `nonCancelledInRange` ใน `reportOrders`
- next:
  - (ถ้ามี) map สถานะยกเลิกเป็นค่าคงที่จาก constants

### [2026-05-11] รายงานยอดขาย: เลือกขอบเขตออเดอร์ (ทุกสถานะ / จัดส่งแล้ว)
- scope: feature
- files: `src/pages/AdminReports.jsx`, `docs/PROJECT_WORKFLOW_REPORT.md`
- summary:
  - เพิ่ม state `salesOrderScope` (`all` | `delivered`) และปุ่มเลือกในหน้ารายงานยอดขาย
  - การ์ดยอดขายรวม จำนวนออเดอร์ ต้นทุน/กำไร ช่องทางชำระ ยอดตามสถานะ สินค้าขายดี ลูกค้า และ daily aggregation ใช้ชุด `reportOrders` ตามตัวเลือก + ช่วงวันที่ (Timestamp)
  - สรุปใบกำกับภาษียังอิงวันที่ใบกำกับเท่าเดิม (ไม่ผูกกับตัวเลือกออเดอร์); CSV ยอดขายระบุขอบเขตออเดอร์
- impact:
  - user: แอดมินเปรียบเทียบยอด “ทุกสถานะในช่วง (ไม่รวมยกเลิก)” กับ “รับรู้หลังจัดส่ง” ได้จากหน้าเดียว
  - dev: โหมดทุกสถานะยังรวมออเดอร์ที่ยังไม่ส่ง (รอตรวจสอบ ฯลฯ) แต่ไม่รวมยกเลิก
- verification:
  - ตรวจ lints `AdminReports.jsx`
  - ทดสอบสลับปุ่มแล้วดูการ์ดและตารางสินค้า/ลูกค้าเปลี่ยนตาม
- rollback:
  - commit: N/A
  - safe-revert: revert การเปลี่ยนใน `AdminReports.jsx` และบรรทัด workflow ที่แก้
- next:
  - (ถ้าต้องการ) ใช้วันที่จัดส่งแทน Timestamp สำหรับกรองช่วงเวลา

### [2026-05-09 15:45] เพิ่มสรุปและ export ใบกำกับภาษีในรายงาน
- scope: feature
- files: `src/pages/AdminReports.jsx`
- summary:
  - เพิ่มตัวชี้วัดจำนวนใบกำกับ, จำนวนลูกค้า, ยอดรวมใบกำกับ
  - เพิ่มตารางใบกำกับภาษีล่าสุดและปุ่ม export CSV แยก
- impact:
  - user: ผู้ใช้แอดมินติดตามสถานะใบกำกับภาษีได้ทันที
  - dev/agent: มีจุดอ้างอิงข้อมูลใบกำกับภาษีในรายงานเดียว
- verification:
  - ตรวจ lints ผ่าน
  - ทดสอบแสดงผลในหน้า Admin Reports
- rollback:
  - commit: N/A
  - safe-revert: revert เฉพาะส่วน tax-invoice report ใน `AdminReports.jsx`
- next:
  - เพิ่ม filter ตารางใบกำกับภาษีล่าสุด (orderId/taxId/customer)

### [2026-05-09 16:10] จัดระเบียบเอกสาร workflow และกฎ Agent
- scope: docs/chore
- files: `docs/PROJECT_WORKFLOW_REPORT.md`, `AGENTS.md`, `.cursor/rules/project-workflow.mdc`, `README.md`, `docs/README.md`
- summary:
  - เพิ่มคู่มือ workflow และกฎบังคับการทำงานของ Agent
  - เชื่อมโยงเอกสารจาก index หลักให้อ่านต่อได้ง่าย
- impact:
  - user: ไม่มีผลต่อการใช้งานระบบปลายทาง
  - dev/agent: onboarding เร็วขึ้นและลดการแก้ไขผิด flow
- verification:
  - ตรวจลิงก์เอกสารภายในโปรเจค
- rollback:
  - commit: N/A
  - safe-revert: ลบไฟล์เอกสาร/กฎที่เพิ่ม แล้วคืน README index
- next:
  - ตั้งกฎการบันทึก progress log แบบบังคับทุกงาน
