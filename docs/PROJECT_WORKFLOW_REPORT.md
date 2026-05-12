# PROJECT WORKFLOW REPORT

เอกสารสรุปการทำงานของโปรเจค SAO CAFE แบบ end-to-end สำหรับส่งต่อทีมพัฒนา/ทีม AI โดยเน้น flow หลักของระบบขายสินค้า, สินค้าชุด, ราคาขั้นบันได, ชำระเงิน, ใบกำกับภาษี และรายงาน

## 1) ภาพรวมสถาปัตยกรรม

- Frontend: React + Vite
- Backend/BaaS: Supabase (Auth + Database + Storage)
- Routing หลักอยู่ที่ `src/App.jsx`
- โดเมนหลัก:
  - Catalog/Cart/Checkout
  - Admin Order + Tax Invoice
  - Reports (Sales/Stock/Tax Invoice summary)

## 2) แผนที่ไฟล์สำคัญ

### 2.1 Product Catalog / Home
- `src/pages/Home.jsx`
- `src/hooks/useProducts.js`
- `src/components/products/ProductCard.jsx`
- `src/utils/helpers.js`
- `src/utils/productCatalog.js`

หน้าที่:
- โหลดสินค้า, filter/search
- normalize product shape ให้ UI ใช้ได้
- เปิด flow เพิ่มสินค้าปกติ/สินค้าชุดลงตะกร้า

### 2.2 Bundle + Tier Pricing
- `src/components/products/BundleSelectionModal.jsx`
- `src/utils/bundleUtils.js`
- `src/utils/priceTiers.js`
- `src/pages/BundleProductComposer.jsx`
- `src/pages/StockManagement.jsx`
- `src/services/productService.js`

หน้าที่:
- สร้างและกำหนดสินค้าแบบชุด (fixed/flexible)
- กำหนด `orderStep`, `bundlePrimaryProductId`, `bundleLines`, `priceTiers`
- คำนวณราคาขั้นบันไดต่อหน่วยตาม qty และ user type

### 2.3 Cart
- `src/hooks/useCart.js`
- `src/components/orders/Cart.jsx`
- `src/utils/priceTiers.js`

หน้าที่:
- จัดการ cart state (localStorage)
- คำนวณราคา line item ทุกครั้งที่ add/update qty
- แสดงยอดรวมก่อน checkout

### 2.4 Checkout / Order Placement
- `src/pages/Checkout.jsx`
- `src/utils/cartSupplierUtils.js`
- `src/utils/couponSupplierSplitUtils.js`
- `src/utils/shippingRates.js`
- `src/services/orderService.js`

หน้าที่:
- คำนวณ subtotal/discount/promotion/shipping/total
- แยกคำนวณตาม supplier (กรณีหลาย supplier)
- สร้าง PromptPay QR
- บันทึกออเดอร์

### 2.5 Admin Orders + Tax Invoice
- `src/pages/AdminOrders.jsx`
- `src/services/taxInvoiceService.js`
- `src/services/printService.js`
- `src/pages/TaxInvoice.jsx`

หน้าที่:
- จัดการสถานะออเดอร์
- บันทึก/พิมพ์ใบกำกับภาษี
- เก็บข้อมูลใบกำกับภาษีลง `tax_invoices`

### 2.6 Reports
- `src/pages/AdminReports.jsx`

หน้าที่:
- รายงานยอดขาย
- รายงานสต็อก
- สรุปใบกำกับภาษี (จำนวนใบกำกับ, จำนวนลูกค้า, ยอดรวมใบกำกับ)
- ตารางใบกำกับภาษีล่าสุด
- Export CSV ทั้งรายงานหลักและรายงานใบกำกับภาษีแยก

## 3) ลำดับการทำงานหลัก (Step-by-step)

1. แอดมินตั้งค่าสินค้า/ชุด/ขั้นบันไดใน `StockManagement` และ `BundleProductComposer`
2. ลูกค้าเข้า `Home` -> โหลดสินค้าผ่าน `useProducts`
3. ลูกค้าเลือกสินค้า:
   - ปกติ: add to cart ตรง
   - แบบชุด: ผ่าน `BundleSelectionModal` + validate จาก `bundleUtils`
4. ระบบคำนวณราคา line item จาก `priceTiers` แล้วเก็บใน `useCart`
5. ลูกค้าไป `Checkout`:
   - รวมยอดผ่าน `cartSupplierUtils`
   - apply โปร/คูปองผ่าน `couponSupplierSplitUtils`
   - ค่าส่งผ่าน `shippingRates`
6. ยืนยันสั่งซื้อ -> `orderService.placeOrder`
7. แอดมินจัดการออเดอร์ใน `AdminOrders`
8. ออกใบกำกับภาษีผ่าน `taxInvoiceService`
9. ฝั่งรายงาน (`AdminReports`) ดึงยอดขาย/สต็อก/ใบกำกับเพื่อแสดงและส่งออก CSV

## 4) จุดที่ต้องระวังเพื่อให้ยอดตรงกันทุกหน้า

- ให้ใช้แหล่งคำนวณเดียวกันสำหรับ line subtotal ระหว่าง Cart และ Checkout
- ระวัง qty ของ bundle flexible ต้องใช้หน่วยจริง ไม่ย่อผิดตาม step
- ส่วนลดและค่าส่งต้องรวมในสูตรเดียวกันกับยอดที่ใช้สร้าง QR และยอดบันทึกออเดอร์
- เวลาสรุปรายงานใบกำกับภาษี ควรนับแบบ unique order/customer ตาม requirement

## 5) แนวทางดูแลโปรเจคให้คลีนและลื่นไหล

- แยกไฟล์ source กับไฟล์ generated ให้ชัดเจน
- ไม่ commit cache/build artifacts ที่ไม่จำเป็น
- รัน lint/test เป็นประจำก่อนปล่อยงาน
- ทำรายงานและ export ให้ใช้ข้อมูลจาก schema เดียวกันเสมอ

## 6) Checklists ก่อนส่งขึ้น production

- [ ] Cart/Checkout/Order total ตรงกันทุกกรณี (normal, bundle, promo, coupon, multi-supplier)
- [ ] PromptPay QR amount ตรงกับยอดชำระจริง
- [ ] Tax invoice save/print/export ได้ครบ
- [ ] Admin Reports แสดงยอดถูกต้องตามช่วงวันที่
- [ ] CSV exports เปิดได้ถูก encoding ภาษาไทย
- [ ] ไม่มี linter errors ในไฟล์ที่แก้ล่าสุด

