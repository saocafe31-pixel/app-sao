# PROJECT PROGRESS LOG

บันทึกความคืบหน้าเพื่อให้ผู้พัฒนาและ Agent รู้สถานะล่าสุดของโปรเจค, ทิศทางถัดไป, และรองรับการย้อนกลับงานได้ง่าย

## วิธีใช้งาน (บังคับใช้)

- ทุกครั้งที่มีการเปลี่ยนแปลงโค้ด ให้เพิ่ม 1 รายการในหัวข้อ `## Change Entries`
- ถ้ามีการ merge PR หรือ commit สำคัญ ให้สรุปเพิ่มใน `## Milestones`
- ระบุ `rollback` ทุกครั้ง ว่าสามารถย้อนกลับด้วย commit/tag ไหน
- ทุกการปล่อยงาน (release) ให้บันทึก tag ตาม `docs/RELEASE_CADENCE.md`

## Current Phase

- Phase: `Stabilization + Reporting`
- Updated At: `2026-06-12`
- Owner: `Team + Agent`
- Next Goal:
  - ทำให้รายงานยอดขาย/ใบกำกับภาษีครบและเชื่อมโยงกับการ export
  - คงความถูกต้องของยอดเงินทั้ง flow (Cart -> Checkout -> Order -> Reports)

## Milestones

- [2026-05-09] เพิ่มรายงานใบกำกับภาษีในหน้า `AdminReports` พร้อม export แยก
- [2026-05-09] สร้างเอกสาร workflow และกฎ Agent ระดับโปรเจค
- [2026-05-09] ตั้งมาตรฐาน release cadence + tag format สำหรับ rollback ระดับ release

## Change Entries

### [2026-06-12 16:20] Admin UX — ปรับ filter realtime ไม่ให้ขึ้น loading screen
- scope: admin, UX, filters, loading-state, enhancement
- files: `src/pages/AdminDashboard.jsx`, `src/pages/AdminReports.jsx`, `src/pages/AdminOrders.jsx`, `src/pages/AdminProducts.jsx`, `docs/PROJECT_PROGRESS_LOG.md`
- summary:
  - แยก initial loading ออกจาก filter refresh ในหน้า `AdminDashboard` และ `AdminReports`
  - หลังโหลดข้อมูลครั้งแรกแล้ว การเปลี่ยนฟิลเตอร์วันที่, ขอบเขตรายงาน, หรือ Supplier จะคงข้อมูลเดิมไว้บนหน้าจอและแสดงสถานะ inline แทน `LoadingSpinner` เต็มหน้า
  - เพิ่มสถานะ inline ใน `AdminOrders` ระหว่าง refresh/load more/load all สำหรับผลค้นหาและตัวกรอง
  - ปรับ `AdminProducts` ให้ search แบบ debounce ไม่ขึ้น loading screen เต็มหน้า แม้ผลก่อนหน้าจะเป็นศูนย์รายการ
- impact:
  - การค้นหา/กรองแบบ realtime ในหน้าแอดมินหลักลื่นขึ้นและไม่ตัด flow ผู้ใช้
  - ไม่เปลี่ยนสูตรยอดเงิน, export, schema, หรือข้อมูลจริงในฐานข้อมูล
  - ยังแสดง `LoadingSpinner` เต็มหน้าตอนเปิดหน้าครั้งแรกที่ยังไม่มีข้อมูลเท่านั้น
- verification:
  - `ReadLints` ผ่านใน `src/pages/AdminDashboard.jsx`, `src/pages/AdminReports.jsx`, `src/pages/AdminOrders.jsx`, `src/pages/AdminProducts.jsx`
  - `npm run build` ผ่าน (มี warning เดิมเรื่อง Browserslist, dynamic/static import ของ `shippingReportExport.js`, และ chunk size)
- rollback: revert `src/pages/AdminDashboard.jsx`, `src/pages/AdminReports.jsx`, `src/pages/AdminOrders.jsx`, `src/pages/AdminProducts.jsx`, และลบ entry นี้จาก `docs/PROJECT_PROGRESS_LOG.md`
- next: ทดสอบจริงบนหน้าแอดมินโดยเปลี่ยนช่วงวันที่, ค้นหาชื่อลูกค้า/อีเมล, เลือก Supplier และค้นหาสินค้า เพื่อดูว่าไม่มี full-screen loading ระหว่าง filter

### [2026-06-12 16:04] Admin Reports — เพิ่มวันที่และ UserEmail ในชีตยอดรวมตามออเดอร์
- scope: admin-reports, export, order-summary, enhancement
- files: `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, `docs/PROJECT_PROGRESS_LOG.md`
- summary:
  - เพิ่มคอลัมน์ `วันที่`, `วันที่สรุปรายวัน`, และ `UserEmail` ในชีต `ยอดรวมตามออเดอร์`
  - `วันที่` ใช้ timestamp ระดับออเดอร์จากแถวแรกของ `OrderID`
  - `วันที่สรุปรายวัน` แปลงเป็น `YYYY-MM-DD` ด้วย logic วันที่ท้องถิ่นเดิมของรายงาน
  - `UserEmail` ใช้ค่าระดับออเดอร์แบบ dedupe ต่อ `OrderID`
  - อัปเดต unit test ของ `buildOrderSummaryRows` ให้ครอบคลุม 3 ฟิลด์ใหม่
- impact: เพิ่มข้อมูลประกอบใน Excel detailed export เท่านั้น ไม่เปลี่ยนการคำนวณยอดเงิน, dashboard cards, schema, หรือข้อมูลจริงในฐานข้อมูล
- verification:
  - `ReadLints` ผ่านใน `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`
  - `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 13 tests
  - `npm run build` ผ่าน (มี warning เดิมเรื่อง Browserslist, dynamic/static import ของ `shippingReportExport.js`, และ chunk size)
- rollback: revert `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, และลบ entry นี้จาก `docs/PROJECT_PROGRESS_LOG.md`
- next: export Excel จริงแล้วตรวจชีต `ยอดรวมตามออเดอร์` ว่าคอลัมน์วันที่และ `UserEmail` ตรงกับชีต `ออเดอร์`

### [2026-06-12 10:18] Admin Reports — แก้ยอดงบกำไรขาดทุนให้ reconcile กับสูตร
- scope: admin-reports, export, profit-loss, order-reconciliation, bugfix
- files: `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, `docs/PROJECT_PROGRESS_LOG.md`
- summary:
  - ตรวจพบว่ายอดในชีต `สรุปงบกำไรขาดทุน` ใช้ `Total` ที่บันทึกระดับออเดอร์เป็นยอดหลัก ทำให้บางช่วงเวลามีผลต่างจากสูตร `รายได้จากสินค้า - ส่วนลด/โปรโมชั่น + ค่าจัดส่ง`
  - เปลี่ยนยอดหลักของงบกำไรขาดทุนเป็น `ยอดขายสุทธิจากสูตร (บาท)` เพื่อให้แถวรายได้/ส่วนลด/ค่าจัดส่ง reconcile กัน
  - เพิ่มแถว `ยอดขายรวมที่บันทึกในออเดอร์ (บาท)` และ `ผลต่างยอดบันทึกกับสูตร (บาท)` เพื่อให้ตรวจสอบยอด historical `Total` ที่คลาดเคลื่อนได้
  - เพิ่มคอลัมน์ `ยอดรวมจากสูตร` และ `ผลต่าง` ในชีต `ยอดรวมตามออเดอร์` เพื่อไล่หาออเดอร์ที่ทำให้เกิดส่วนต่าง เช่น 15 บาท
- impact:
  - แก้เฉพาะการคำนวณและการแสดงผล Excel detailed export ไม่เปลี่ยน schema หรือข้อมูลจริงในฐานข้อมูล
  - งบกำไรขาดทุนจะแสดงยอดขายสุทธิที่ตรงกับสูตร ส่วนยอด `Total` เดิมยังแสดงแยกไว้เป็นหลักฐานตรวจสอบ
  - การตรวจสอบยอดเงิน: `รายได้จากสินค้า - ส่วนลด/โปรโมชั่น + ค่าจัดส่ง` ต้องเท่ากับ `ยอดขายสุทธิจากสูตร`
- verification:
  - `ReadLints` ผ่านใน `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`
  - `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 13 tests
  - `npm run build` ผ่าน (มี warning เดิมเรื่อง Browserslist, dynamic/static import ของ `shippingReportExport.js`, และ chunk size)
- rollback: revert `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, และลบ entry นี้จาก `docs/PROJECT_PROGRESS_LOG.md`
- next: export รายงาน Excel ช่วง 2026-05-01 ถึง 2026-05-31 แล้วตรวจว่า `ผลต่างยอดบันทึกกับสูตร (บาท)` เท่ากับ 15 และดูชีต `ยอดรวมตามออเดอร์` เพื่อระบุ OrderID ที่มีผลต่าง

### [2026-06-12 10:06] Admin Reports — เพิ่ม Supplier ในชีตยอดรวมตามออเดอร์
- scope: admin-reports, export, order-summary, enhancement
- files: `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, `docs/PROJECT_PROGRESS_LOG.md`
- summary:
  - เพิ่มคอลัมน์ `ซัพพลายเออร์` ในชีต `ยอดรวมตามออเดอร์`
  - `buildOrderSummaryRows` รับ `productSupplierById` เพื่อ resolve Supplier จาก `ProductID -> Supplier`
  - หากออเดอร์หนึ่งมีหลาย Supplier จะแสดงชื่อ Supplier แบบไม่ซ้ำและคั่นด้วย `,`
  - อัปเดต unit test ให้ครอบคลุม Supplier ใน order summary
- impact: เพิ่มข้อมูลประกอบในไฟล์ Excel export เท่านั้น ไม่เปลี่ยนยอดเงิน การคำนวณ หรือข้อมูลจริงในฐานข้อมูล
- verification:
  - `ReadLints` ผ่านใน `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`
  - `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 13 tests
  - `npm run build` ผ่าน (มี warning เดิมเรื่อง Browserslist, dynamic/static import ของ `shippingReportExport.js`, และ chunk size)
- rollback: revert `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, และลบ entry นี้จาก `docs/PROJECT_PROGRESS_LOG.md`
- next: export Excel จริงแล้วตรวจชีต `ยอดรวมตามออเดอร์` ว่าคอลัมน์ `ซัพพลายเออร์` ตรงกับชีต `ออเดอร์`

### [2026-06-12 09:44] Admin Reports — การ์ดปรับตาม Supplier filter + ชีตงบกำไรขาดทุน
- scope: admin-reports, supplier-filter, sales-summary, export, profit-loss, enhancement
- files: `src/pages/AdminReports.jsx`, `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, `docs/PROJECT_PROGRESS_LOG.md`
- summary:
  - ปรับการ์ดรายงานยอดขายให้คำนวณตาม Supplier ที่เลือกในฟิลเตอร์หลายซัพ (`selectedReportSuppliers`)
  - เมื่อเลือก Supplier ระบบจะกรองรายการสินค้าในออเดอร์ด้วย lookup จากสินค้า (`ProductID/ชื่อสินค้า -> Supplier`) ก่อนคำนวณยอดขาย, จำนวนออเดอร์, ยอดชำระแยกช่องทาง, สินค้าขายดี, ลูกค้า, daily sales, ต้นทุน และกำไร
  - โหลดข้อมูลสินค้าเพียงชุดเดียวใน `fetchSalesReport` เพื่อใช้ทั้ง supplier lookup และ cost map
  - ปรับ Supplier ว่างให้ normalize เป็น `ส่วนกลาง` เพื่อให้เลือกกรองได้
  - เพิ่มชีต `สรุปงบกำไรขาดทุน` ใน Excel export และอัปเดตปุ่มเป็น `ส่งออก Excel ละเอียด (7 ชีต)`
  - ชีตงบกำไรขาดทุนสรุป: รายได้จากสินค้า, ส่วนลด/โปรโมชั่น, ค่าจัดส่ง, ยอดขายรวมตามออเดอร์, ต้นทุนสินค้า, กำไรขั้นต้นก่อนค่าจัดส่ง, กำไรสุทธิ, อัตรากำไรสุทธิ
- impact:
  - แอดมินดูการ์ดรายงานและส่งออก Excel ตาม Supplier เดียวกันได้
  - เพิ่มชีตช่วยตรวจงบกำไรขาดทุนจากชุดข้อมูล export เดียวกัน
  - ไม่เปลี่ยน schema หรือข้อมูลจริงในฐานข้อมูล
- verification:
  - `ReadLints` ผ่านใน `src/pages/AdminReports.jsx`, `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`
  - `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 13 tests
  - `npm run build` ผ่าน (มี warning เดิมเรื่อง Browserslist, dynamic/static import ของ `shippingReportExport.js`, และ chunk size)
- rollback: revert `src/pages/AdminReports.jsx`, `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, และลบ entry นี้จาก `docs/PROJECT_PROGRESS_LOG.md`
- next: เลือก Supplier 1-2 รายแล้วตรวจว่าการ์ดรายงาน, ชีต `สรุปงบกำไรขาดทุน`, และชีตอื่นใน Excel ใช้ขอบเขต Supplier เดียวกัน

### [2026-06-12 09:37] Admin Reports — เพิ่มฟิลเตอร์ Supplier สำหรับส่งออก Excel รายละเอียด
- scope: admin-reports, export, supplier-filter, enhancement
- files: `src/pages/AdminReports.jsx`, `docs/PROJECT_PROGRESS_LOG.md`
- summary:
  - เพิ่มตัวเลือก Supplier แบบหลายรายการในหน้า `AdminReports` สำหรับปุ่ม `ส่งออก Excel ละเอียด (6 ชีต)`
  - โหลดรายการ Supplier จากตาราง `products` แบบ paginate และให้เลือก/ล้าง/เลือกทั้งหมดได้
  - ตอน export จะกรองแถวออเดอร์หลังเลือกช่วงวันที่และสถานะแล้ว โดยใช้ `ProductID -> Supplier` และ helper `resolveProductSupplierForReport`
  - ถ้าไม่เลือก Supplier ใด จะส่งออกทุก Supplier ตามเดิม; ถ้าเลือกหลาย Supplier จะส่งออกเฉพาะแถวสินค้าของ Supplier เหล่านั้น
  - เพิ่ม `ซัพพลายเออร์: ...` ใน `scopeLabel` ของชีต `สรุปรวม` เพื่อบอกขอบเขต export
- impact:
  - เพิ่มความสามารถในการส่งออกรายงานยอดขายตาม Supplier ได้หลาย Supplier ต่อครั้ง
  - ตัวกรองนี้ใช้เฉพาะ Excel รายละเอียด ไม่เปลี่ยนยอดที่แสดงบนแดชบอร์ด, ไม่เปลี่ยน CSV/ใบกำกับ, ไม่เปลี่ยน schema หรือข้อมูลจริง
- verification:
  - `ReadLints` ผ่านใน `src/pages/AdminReports.jsx`
  - `npm run build` ผ่าน (มี warning เดิมเรื่อง Browserslist, dynamic/static import ของ `shippingReportExport.js`, และ chunk size)
- rollback: revert `src/pages/AdminReports.jsx` และลบ entry นี้จาก `docs/PROJECT_PROGRESS_LOG.md`
- next: ทดลองเลือก 1-2 Supplier แล้ว export Excel ตรวจชีต `ออเดอร์`, `ยอดรวมตามออเดอร์`, และ `สรุปรวม` ว่าเหลือเฉพาะแถวสินค้าของ Supplier ที่เลือก

### [2026-06-12 09:31] Admin Reports — เพิ่มช่องทางชำระในชีตยอดรวมตามออเดอร์
- scope: admin-reports, export, order-summary, enhancement
- files: `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, `docs/PROJECT_PROGRESS_LOG.md`
- summary:
  - เพิ่มคอลัมน์ `ช่องทางชำระ` ในชีต `ยอดรวมตามออเดอร์`
  - ค่าอ่านจาก `PaymentMethod` ระดับออเดอร์แบบนับครั้งเดียวต่อ `OrderID`
  - แสดงผลให้อ่านง่าย: `transfer`/ค่าว่าง เป็น `โอนเงิน`, `credit` เป็น `เครดิต`, ค่าอื่นใช้ค่าดิบ
  - อัปเดต unit test ของ `buildOrderSummaryRows` ให้ครอบคลุม `paymentMethod`
- impact: เพิ่มข้อมูลประกอบในไฟล์ Excel export เท่านั้น ไม่เปลี่ยนยอดเงิน การคำนวณ หรือข้อมูลจริงในฐานข้อมูล
- verification:
  - `ReadLints` ผ่านใน `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`
  - `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 12 tests
  - `npm run build` ผ่าน (มี warning เดิมเรื่อง Browserslist, dynamic/static import ของ `shippingReportExport.js`, และ chunk size)
- rollback: revert `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, และลบ entry นี้จาก `docs/PROJECT_PROGRESS_LOG.md`
- next: export Excel จริงแล้วตรวจชีต `ยอดรวมตามออเดอร์` ว่าคอลัมน์ `ช่องทางชำระ` ตรงกับชีต `ออเดอร์`

### [2026-06-12 09:15] Admin Reports — เพิ่มชีตยอดรวมตามแต่ละออเดอร์ใน Excel export
- scope: admin-reports, export, order-summary, enhancement
- files: `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, `src/pages/AdminReports.jsx`, `docs/PROJECT_PROGRESS_LOG.md`
- summary:
  - เพิ่มชีต `ยอดรวมตามออเดอร์` ในไฟล์ Excel รายงานละเอียด
  - ชีตใหม่มีคอลัมน์ `เลขที่ออเดอร์`, `ยอดซื้อรวม`, `ส่วนลด/โปรโมชั่น`, `ค่าจัดส่ง`, `สรุปยอดรวมคำสั่งซื้อ`
  - `ยอดซื้อรวม` คำนวณจากทุกรายการสินค้าในออเดอร์ (`Qty * Price`) ส่วน `ส่วนลด/โปรโมชั่น`, `ค่าจัดส่ง`, และ `สรุปยอดรวมคำสั่งซื้อ` ใช้ค่าระดับออเดอร์แบบนับครั้งเดียวต่อ `OrderID`
  - เพิ่ม `buildOrderSummaryRows` และ unit test เพื่อกันการคูณซ้ำเมื่อ 1 ออเดอร์มีหลายแถวสินค้า
  - อัปเดตป้ายปุ่ม export เป็น `ส่งออก Excel ละเอียด (6 ชีต)`
- impact: เพิ่มชีตช่วยตรวจยอดรายออเดอร์ในไฟล์ export; ไม่เปลี่ยนยอดเงินใน Cart/Checkout/Order/Reports UI และไม่เปลี่ยน schema/database
- verification:
  - `ReadLints` ผ่านใน `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, `src/pages/AdminReports.jsx`
  - `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 12 tests
  - `npm run build` ผ่าน (มี warning เดิมเรื่อง Browserslist, dynamic/static import ของ `shippingReportExport.js`, และ chunk size)
- rollback: revert `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, `src/pages/AdminReports.jsx`, และลบ entry นี้จาก `docs/PROJECT_PROGRESS_LOG.md`
- next: export Excel จริงแล้วตรวจชีต `ยอดรวมตามออเดอร์` เทียบกับชีต `ออเดอร์` และแถว `ยอดขายรวมตามออเดอร์ (บาท)` ในชีต `สรุปรวม`

### [2026-06-12 09:10] Admin Reports — แก้ยอดแดชบอร์ดไม่ตรงกับ Excel export
- scope: admin-reports, export, sales-summary, fix
- files: `src/services/orderService.js`, `src/pages/AdminReports.jsx`, `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, `docs/PROJECT_PROGRESS_LOG.md`
- summary:
  - แก้ `orderService.getAllOrders()` ให้โหลดแถวดิบจากตาราง `order` แบบ paginate ผ่าน `getRawOrderRowsByDateRange()` ก่อน group เป็นออเดอร์ เพื่อไม่โดน Supabase/PostgREST max-rows จำกัดที่ 1,000 แถวล่าสุด
  - แก้การ filter วันที่และ daily sales ใน `AdminReports` ให้ใช้วันที่ท้องถิ่นผ่าน `toYmd(new Date(...))` แทน `toISOString().split('T')[0]` เพื่อให้ตรงกับช่วงวันที่ที่ export ใช้
  - เพิ่มแถว `ยอดขายรวมตามออเดอร์ (บาท)` ในชีต "สรุปรวม" ของ Excel ซึ่งใช้สูตรเดียวกับการ์ด `ยอดขายรวม` บนแดชบอร์ด (sum `Total` หลัง dedupe ต่อ `OrderID`)
  - คงแถว `ราคารวมสินค้าที่ขายได้ (บาท)` เป็นยอดสินค้า (`Qty * Price`) เพื่อแยกจากยอดออเดอร์รวมที่รวมผลของส่วนลด/ค่าส่งตาม `Total`
- impact:
  - แดชบอร์ดรายงานยอดขายและ export จะใช้แหล่งข้อมูลครบชุดมากขึ้น ไม่ถูกจำกัดแค่ 1,000 แถวดิบล่าสุด
  - ลดความสับสนระหว่างยอดขายรวมตามออเดอร์กับยอดรวมสินค้าใน Excel
  - ไม่เปลี่ยน schema หรือข้อมูลจริงในฐานข้อมูล
- verification:
  - `ReadLints` ผ่านใน `src/services/orderService.js`, `src/pages/AdminReports.jsx`, `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`
  - `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 11 tests
  - `npm run build` ผ่าน (มี warning เดิมเรื่อง dynamic/static import ของ `shippingReportExport.js` และ chunk size)
- rollback: revert `src/services/orderService.js`, `src/pages/AdminReports.jsx`, `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, และลบ entry นี้จาก `docs/PROJECT_PROGRESS_LOG.md`
- next: export Excel ในช่วงเดียวกับหน้าจอ แล้วเทียบการ์ด `ยอดขายรวม` กับแถว `ยอดขายรวมตามออเดอร์ (บาท)` ในชีต "สรุปรวม"

### [2026-06-11 00:49] Admin Reports — สรุปพรอมต์ฟังก์ชันส่งออก Excel รายงานละเอียดล่าสุด
- scope: admin-reports, export, docs, handoff
- files: `docs/PROJECT_PROGRESS_LOG.md`
- summary:
  - เพิ่มสรุปพรอมต์แบบคัดลอกได้สำหรับงาน "ส่งออก Excel รายงานละเอียด" ที่ทำล่าสุด
  - ครอบคลุมงานหลัก: export Excel หลายชีต, สรุปลูกค้า, สรุปสินค้า, สรุปรวม, สรุปรายวัน, ช่องทางชำระ, จำนวนใช้โค้ด/โปรโมชั่น, ชื่อลูกค้าจาก `users`, และคอลัมน์ `Supplier`
  - ระบุจุดที่ต้องระวังเรื่องยอดระดับออเดอร์ในตาราง `order` ที่ซ้ำทุกแถวสินค้า และต้อง dedupe ต่อ `OrderID`
- impact: เป็นเอกสาร handoff/พรอมต์เท่านั้น ไม่กระทบโค้ด export, ยอดเงิน, schema, หรือข้อมูลจริง
- verification: ตรวจรายการ progress log และไฟล์ที่เกี่ยวข้อง (`AdminReports`, `orderDetailReportExport`, tests, `orderService`) เพื่อสรุปพรอมต์; ไม่จำเป็นต้องรัน build เพราะแก้เอกสารอย่างเดียว
- rollback: ลบ entry นี้ออกจาก `docs/PROJECT_PROGRESS_LOG.md`
- next: ใช้พรอมต์ด้านล่างเมื่อต้องให้ Agent สานต่อ/ตรวจ/แก้ไขฟังก์ชันส่งออกรายงาน

พรอมต์พร้อมคัดลอก:

```text
ช่วยพัฒนา/ตรวจสอบฟังก์ชันส่งออก Excel รายงานออเดอร์ละเอียดในหน้า Admin Reports ของโปรเจกต์ SAO CAFE

บริบทระบบ:
- ตาราง `order` เก็บ 1 แถวต่อ 1 รายการสินค้า ดังนั้น 1 OrderID อาจมีหลายแถว
- ค่าระดับออเดอร์ เช่น `Total`, `Discount`, `Shipping Cost`, `PaymentMethod`, `DiscountInfo` ถูกบันทึกซ้ำทุกแถวของ OrderID เดียวกัน
- เวลาสรุปยอดระดับออเดอร์ต้อง dedupe ต่อ `OrderID` ก่อนรวมเสมอ เพื่อไม่ให้นับยอดซ้ำ
- ใช้ช่วงวันที่และขอบเขตออเดอร์เดียวกับหน้า `AdminReports` (เช่น shipped only / all non-cancelled)

สิ่งที่ต้องมีใน export:
1. เพิ่ม/รักษาปุ่มส่งออก Excel รายงานละเอียดใน `src/pages/AdminReports.jsx`
2. ใช้ utility แยกใน `src/utils/orderDetailReportExport.js` และ dynamic import Excel library เฉพาะตอน export
3. ไฟล์ Excel ต้องมีชีตหลัก:
   - ชีต "ออเดอร์": แถวดิบจากตาราง `order` พร้อมลำดับ, วันที่สรุปรายวัน, `Supplier`, และคอลัมน์สำคัญ เช่น `OrderID`, `UserEmail`, `Username`, `Itemname`, `Qty`, `Price`, `Total`, `Status`, `PaymentMethod`, `ProductID`
   - ชีต "สรุปยอดซื้อลูกค้า": รวมต่อ user/email, จำนวนออเดอร์, จำนวนชิ้น, ยอดซื้อรวม เรียงยอดมากไปน้อย
   - ชีต "สรุปสินค้า": รวมจำนวนขายและยอดขายต่อสินค้า เรียงมากไปน้อย
   - ชีต "สรุปรวม": จำนวนออเดอร์, จำนวนชิ้น, ราคารวมสินค้า, ส่วนลดแยกโค้ด/โปรโมชั่น, จำนวนครั้งที่ใช้โค้ด/โปรโมชั่น, ค่าขนส่งรวม, ยอดชำระแยกโอน/เครดิต
   - ชีต "สรุปรายวัน": สรุปต่อวัน (`YYYY-MM-DD`) โดยนับค่าระดับออเดอร์ครั้งเดียวต่อ `OrderID`; แยกยอดโอน/เครดิต
4. `Username` ใน export ต้องใช้ชื่อจากตาราง `users` ตาม `UserEmail` เมื่อค่า snapshot ใน `order.Username` เป็นอีเมลหรือว่าง
5. `Supplier` ในชีต "ออเดอร์" ต้อง resolve จาก product map (`ProductID -> Supplier`) เป็นหลัก และ fallback จาก `row.Supplier` หรือ `DiscountInfo` ถ้ามี
6. ส่วนลดจาก `DiscountInfo` ต้อง parse โค้ด/โปรโมชั่นอย่างระวัง และห้ามจับ `Batch ID` เป็นส่วนลด
7. ยกเลิกออเดอร์ต้องถูกกรอง/ไม่นับตาม scope รายงานปัจจุบัน
8. ใส่ style Excel ให้ใช้งานง่าย: หัวตารางเด่น, เส้นตาราง, number format, ความกว้างคอลัมน์, และ freeze/auto filter ถ้าทำได้โดยไม่เพิ่มความเสี่ยง

ไฟล์สำคัญ:
- `src/pages/AdminReports.jsx`
- `src/utils/orderDetailReportExport.js`
- `src/utils/orderDetailReportExport.test.js`
- `src/services/orderService.js`
- `src/utils/customerProfileLookup.js`

แนวทางตรวจสอบ:
- เพิ่ม/อัปเดต unit tests ใน `src/utils/orderDetailReportExport.test.js`
- ต้องมี test อย่างน้อยสำหรับ:
  - dedupe `Total`, `Discount`, `Shipping Cost` ต่อ `OrderID`
  - สรุปรายวันแยกยอดโอน/เครดิต
  - resolve `Username` จาก profile map
  - resolve `Supplier` จาก product map และ fallback
  - parser ส่วนลดไม่จับ `Batch ID` เป็นส่วนลด
- รัน `npm run test:run -- src/utils/orderDetailReportExport.test.js`
- รัน `npm run build`
- หลังแก้ให้บันทึก `docs/PROJECT_PROGRESS_LOG.md` พร้อม summary, impact, verification, rollback, next step
```

### [2026-06-11 00:25] Admin Reports — เพิ่ม Supplier ในชีตออเดอร์ของรายงาน Excel
- scope: admin-reports, export, enhancement
- files: `src/pages/AdminReports.jsx`, `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`
- summary:
  - ชีต "ออเดอร์" เพิ่มคอลัมน์ `Supplier` ถัดจาก `ProductID`
  - ก่อน export จะโหลด map `ProductID -> Supplier` จากตาราง `products` แบบ paginate ทีละ 1000 แถว
  - exporter ใช้ supplier จาก product map เป็นหลัก และ fallback จากค่า `Supplier` ในแถว/`DiscountInfo` ถ้ามี
  - เพิ่ม unit test สำหรับการ resolve supplier จาก product map และ fallback จาก `DiscountInfo`
- impact: เพิ่มคอลัมน์ช่วยตรวจสอบซัพพลายเออร์สินค้าในไฟล์ Excel; ไม่เปลี่ยนยอดเงินหรือข้อมูลจริงในฐานข้อมูล
- verification: `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 11 tests, `npm run build` ผ่าน, lint สะอาด
- rollback: revert `src/pages/AdminReports.jsx`, `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`
- next: export ไฟล์จริงแล้วตรวจคอลัมน์ `Supplier` ในชีต "ออเดอร์" เทียบกับตารางสินค้า

### [2026-06-11 00:20] Admin Reports — แก้ Username ในชีตออเดอร์ให้แสดงชื่อลูกค้า
- scope: admin-reports, export, fix
- files: `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`
- summary:
  - ชีต "ออเดอร์" เปลี่ยนการแสดงคอลัมน์ `Username` ให้ใช้ชื่อจาก `users.Username` ตาม `UserEmail` เมื่อค่า snapshot ใน `order.Username` เป็นอีเมล
  - เพิ่ม helper `resolveCustomerNameForReport` ใช้ร่วมกับชีต "สรุปยอดซื้อลูกค้า" เพื่อให้ logic ชื่อลูกค้าตรงกัน
  - เพิ่ม unit test ยืนยันว่า raw order row ที่ `Username` เป็นอีเมลจะถูกแทนด้วยชื่อจาก profile map
- impact: เปลี่ยนเฉพาะค่าที่แสดงในไฟล์ Excel export; ไม่แก้ข้อมูลดิบในฐานข้อมูลและไม่กระทบยอดเงิน
- verification: `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 10 tests, `npm run build` ผ่าน, lint สะอาด
- rollback: revert `src/utils/orderDetailReportExport.js` และ `src/utils/orderDetailReportExport.test.js`
- next: export ไฟล์จริงแล้วตรวจชีต "ออเดอร์" ว่าคอลัมน์ `Username` ไม่เป็นอีเมลซ้ำกับ `UserEmail`

### [2026-06-11 00:15] Admin Reports — เพิ่มช่องทางชำระในสรุปรายวัน + วันที่สรุปรายวันในชีตออเดอร์
- scope: admin-reports, export, enhancement
- files: `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`
- summary:
  - ชีต "สรุปรายวัน" เพิ่มคอลัมน์ `ยอดชำระโอน (บาท)` และ `ยอดชำระเครดิต (บาท)` โดยนับยอดระดับออเดอร์ครั้งเดียวต่อ `OrderID`
  - ชีต "ออเดอร์" เพิ่มคอลัมน์ `วันที่สรุปรายวัน` ถัดจากลำดับ เพื่อให้เทียบกลับกับชีต "สรุปรายวัน" ได้ตรงวัน
  - วันที่สรุปรายวันใช้ `Timestamp` ของออเดอร์แปลงเป็นวันที่ท้องถิ่นรูปแบบ `YYYY-MM-DD` ซึ่งเป็นเกณฑ์เดียวกับชีตรายวัน
- impact: เพิ่มคอลัมน์ในไฟล์ Excel export เพื่อช่วยตรวจสอบยอดรายวัน; ไม่เปลี่ยนยอดในระบบหรือหน้ารายงาน
- verification: `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 9 tests, `npm run build` ผ่าน, lint สะอาด
- rollback: revert `src/utils/orderDetailReportExport.js` และ `src/utils/orderDetailReportExport.test.js`
- next: export ไฟล์จริงแล้วตรวจยอดโอน/เครดิตรายวันเทียบกับชีตออเดอร์โดยใช้คอลัมน์ `วันที่สรุปรายวัน`

### [2026-06-10 23:45] Admin Reports — แก้ชื่อลูกค้าในชีตสรุปยอดซื้อลูกค้า
- scope: admin-reports, export, fix
- files: `src/pages/AdminReports.jsx`, `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`
- summary:
  - หน้า export รายงานละเอียดดึง `Username` จากตาราง `users` ตาม `UserEmail` ผ่าน `fetchUsernameByEmailMap`
  - ชีต "สรุปยอดซื้อลูกค้า" ใช้ชื่อจาก profile ก่อน และ fallback ไปใช้ `order.Username` เฉพาะกรณีไม่ซ้ำกับอีเมล
  - เพิ่ม unit test กรณี `order.Username` เป็นอีเมล เพื่อให้ชื่อในชีตสรุปถูกแทนด้วยชื่อจากตาราง `users`
- impact: แก้เฉพาะชื่อแสดงผลในไฟล์ Excel; ไม่กระทบยอดเงินหรือข้อมูลดิบในชีตออเดอร์
- verification: `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 9 tests, `npm run build` ผ่าน, lint สะอาด
- rollback: revert `src/pages/AdminReports.jsx`, `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`
- next: export ไฟล์จริงแล้วตรวจชีต "สรุปยอดซื้อลูกค้า" ว่าคอลัมน์ชื่อลูกค้าไม่เป็นอีเมลซ้ำ

### [2026-06-10 23:40] Admin Reports — เพิ่มจำนวนการใช้โค้ด/โปรโมชั่นในชีตสรุปรวม
- scope: admin-reports, export, enhancement
- files: `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`
- summary:
  - เพิ่มแถว `จำนวนการใช้โค้ดส่วนลดรวม (ครั้ง)` และ `จำนวนการใช้โปรโมชั่นรวม (ครั้ง)` ในชีต "สรุปรวม"
  - เพิ่มแถวจำนวนครั้งแยกตามชื่อโค้ดและชื่อโปรโมชั่น เช่น `จำนวนใช้โค้ด: SAVE50 (ครั้ง)` และ `จำนวนใช้โปรโมชั่น: ... (ครั้ง)`
  - ยังคง dedupe ต่อ `OrderID` ก่อนนับ เพื่อไม่ให้ออเดอร์ที่มีหลายแถวสินค้านับซ้ำ
- impact: เปลี่ยนเฉพาะข้อมูลในไฟล์ Excel export; ไม่กระทบยอดเงินใน Cart/Checkout/Order/Reports UI
- verification: `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 8 tests, `npm run build` ผ่าน, lint สะอาด
- rollback: revert `src/utils/orderDetailReportExport.js` และ `src/utils/orderDetailReportExport.test.js`
- next: เปิดไฟล์ Excel จริงตรวจแถวจำนวนครั้งในชีต "สรุปรวม"

### [2026-06-10 23:30] Admin Reports — เพิ่มชีตสรุปยอดรายวันในรายงาน Excel ละเอียด (ชีตที่ 5)
- scope: admin-reports, export, feature
- files: `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, `src/pages/AdminReports.jsx`
- summary:
  - เพิ่ม `buildDailySummaryRows` สรุปยอดต่อวัน (เวลาท้องถิ่นไทย) เรียงวันที่เก่า→ใหม่
  - ชีต "สรุปรายวัน": ลำดับ / วันที่ / จำนวนออเดอร์ / จำนวนชิ้น / ยอดสินค้า / ส่วนลด / ค่าขนส่ง / ยอดออเดอร์รวม
  - ค่าระดับออเดอร์ (ส่วนลด/ค่าส่ง/ยอดรวม) dedupe ต่อ OrderID เหมือนชีตอื่น
  - ปุ่ม export เปลี่ยนป้ายเป็น "ส่งออก Excel ละเอียด (5 ชีต)"
- impact: เพิ่มชีตใหม่ในไฟล์ export — ไม่กระทบ 4 ชีตเดิมและการคำนวณยอดในแอป
- verification: `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 8 tests (เพิ่ม test รายวัน), `npm run build` ผ่าน, lint สะอาด
- rollback: revert 3 ไฟล์ข้างต้น (ลบ buildDailySummaryRows + บล็อกชีตที่ 5 + test)
- next: เปิดไฟล์จริงตรวจยอดรายวันเทียบกราฟยอดขายรายวันในหน้ารายงาน

### [2026-06-10 23:25] Admin Reports — เพิ่มลำดับรายการ + เส้นตาราง/สไตล์ในรายงาน Excel ละเอียด
- scope: admin-reports, export, ui-polish
- files: `src/utils/orderDetailReportExport.js`, `package.json`
- summary:
  - เพิ่มคอลัมน์ "ลำดับ" ในชีตออเดอร์ดิบ / สรุปลูกค้า / สรุปสินค้า
  - ใส่เส้นตารางทุกเซลล์, หัวตารางตัวหนาพื้นเขียวอักษรขาว, แถวสลับสี, ตัวเลขชิดขวา + ฟอร์แมต #,##0 / #,##0.00, กำหนดความกว้างคอลัมน์
  - สลับ dependency `xlsx` → `xlsx-js-style` (API เดียวกัน แต่รองรับ cell style; ยังโหลดแบบ dynamic import เฉพาะตอน export)
- impact: เฉพาะรูปแบบไฟล์ Excel ที่ export — ไม่กระทบการคำนวณยอดใดๆ
- verification: `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 7 tests, `npm run build` ผ่าน, lint สะอาด
- rollback: revert `orderDetailReportExport.js`, `npm uninstall xlsx-js-style && npm install xlsx`
- next: เปิดไฟล์จริงใน Excel/Google Sheets ตรวจความสวยงาม

### [2026-06-10 23:10] Admin Reports — ส่งออกรายงานออเดอร์ละเอียด 4 ชีต (Excel)
- scope: admin-reports, export, feature
- files: `src/utils/orderDetailReportExport.js`, `src/utils/orderDetailReportExport.test.js`, `src/pages/AdminReports.jsx`, `src/services/orderService.js`, `package.json`
- summary:
  - เพิ่มปุ่ม "ส่งออก Excel ละเอียด (4 ชีต)" ในหน้ารายงานยอดขาย ใช้ฟิลเตอร์วันที่ + ขอบเขตออเดอร์เดียวกับหน้ารายงาน
  - ชีต 1: แถวดิบทุกคอลัมน์จากตาราง `order` (OrderID…RecipientPhone + Status)
  - ชีต 2: สรุปยอดซื้อต่อลูกค้า (อีเมล/ชื่อ/จำนวนออเดอร์/จำนวนชิ้น/ยอดซื้อรวม) เรียงมาก→น้อย
  - ชีต 3: สรุปต่อสินค้า (จำนวนขาย + ยอดขาย) เรียงมาก→น้อย
  - ชีต 4: สรุปรวม — จำนวนชิ้น, ราคารวมสินค้า, ส่วนลดแยกรายชื่อโค้ด/รายชื่อโปรโมชั่น (map จาก PromoIds), ค่าขนส่งรวม, ยอดชำระแยกเครดิต/โอน
  - ค่าระดับออเดอร์ (Total/Discount/ค่าส่ง) ที่ DB บันทึกซ้ำทุกแถวของออเดอร์เดียวกัน ถูก dedupe ต่อ OrderID ก่อนรวมยอด
  - เพิ่ม `orderService.getRawOrderRowsByDateRange` ดึงแถวดิบตามช่วงวันที่แบบ paginate ทีละ 1000 (เคารพ max-rows cap)
  - เพิ่ม dependency `xlsx` (โหลดแบบ dynamic import เฉพาะตอน export)
- impact:
  - user: แอดมินดึงรายงานละเอียดเป็นไฟล์ Excel ชีตเดียวจบ ครบทั้งดิบและสรุป
  - dev/agent: ฟังก์ชัน aggregate เป็น pure function มี unit test ครอบ; parser ส่วนลดไม่จับ Batch ID เป็นส่วนลด
- verification:
  - `npm run test:run -- src/utils/orderDetailReportExport.test.js` ผ่าน 7 tests
  - `npm run build` ผ่าน (xlsx แยก chunk ~429KB โหลดเฉพาะตอนใช้)
  - `ReadLints` ไม่มี error
- rollback:
  - commit: N/A
  - safe-revert: ลบ 2 ไฟล์ util ใหม่, revert `AdminReports.jsx` + `orderService.js`, `npm uninstall xlsx`
- next:
  - ตรวจไฟล์จริงกับข้อมูล production (ช่วงที่มีทั้งโค้ดและโปร) ว่าชีต 4 แยกยอดถูกต้อง

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
