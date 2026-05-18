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
