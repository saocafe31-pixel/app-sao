# AGENTS WORKFLOW GUIDE

คู่มือสั้นสำหรับ AI Agent ที่เข้ามาทำงานในโปรเจคนี้

## เป้าหมายหลัก
- รักษาความถูกต้องของยอดเงินตั้งแต่ Home -> Cart -> Checkout -> Order -> Admin Reports
- แก้ไขแบบปลอดภัย: ไม่เปลี่ยนพฤติกรรมที่ไม่เกี่ยวข้อง
- ใช้โครงสร้างและ utility เดิมให้มากที่สุดก่อนเพิ่มโค้ดใหม่

## ลำดับการทำงานที่ต้องเข้าใจก่อนแก้โค้ด
1. Routing และขอบเขตหน้า: `src/App.jsx`
2. Product catalog: `src/pages/Home.jsx`, `src/hooks/useProducts.js`
3. Bundle + Tier pricing: `src/components/products/BundleSelectionModal.jsx`, `src/utils/bundleUtils.js`, `src/utils/priceTiers.js`
4. Cart: `src/hooks/useCart.js`, `src/components/orders/Cart.jsx`
5. Checkout: `src/pages/Checkout.jsx`, `src/utils/cartSupplierUtils.js`, `src/utils/couponSupplierSplitUtils.js`, `src/utils/shippingRates.js`
6. Order + Tax Invoice + Reports: `src/services/orderService.js`, `src/services/taxInvoiceService.js`, `src/pages/AdminOrders.jsx`, `src/pages/AdminReports.jsx`

## กติกาการแก้ไข
- แก้ให้น้อยที่สุด (smallest safe change)
- ถ้าแตะการคำนวณยอด ให้ตรวจผลกระทบทั้ง Cart, Checkout, QR, Reports
- หลังแก้ไขไฟล์สำคัญ ให้ตรวจ lint เสมอ
- ห้ามลบ/แก้ schema หรือข้อมูลจริงโดยไม่จำเป็น
- ทุกงานที่มีนัยสำคัญต้องบันทึกใน `docs/PROJECT_PROGRESS_LOG.md` พร้อมเวลา, ขอบเขตงาน, ผลกระทบ, วิธีตรวจสอบ, และ rollback plan
- ห้ามปิดงานโดยไม่มี progress entry
- ต้องยึด release cadence และรูปแบบ tag ตาม `docs/RELEASE_CADENCE.md` (เช่น `v2026.05.w2`)

## เอกสารอ้างอิง
- Workflow รายละเอียด: `docs/PROJECT_WORKFLOW_REPORT.md`
- Progress/สถานะล่าสุด: `docs/PROJECT_PROGRESS_LOG.md`
- Release cadence + rollback release-level: `docs/RELEASE_CADENCE.md`
- ดัชนีเอกสาร: `docs/README.md`
