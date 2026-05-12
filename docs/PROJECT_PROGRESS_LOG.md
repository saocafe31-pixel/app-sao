# PROJECT PROGRESS LOG

บันทึกความคืบหน้าเพื่อให้ผู้พัฒนาและ Agent รู้สถานะล่าสุดของโปรเจค, ทิศทางถัดไป, และรองรับการย้อนกลับงานได้ง่าย

## วิธีใช้งาน (บังคับใช้)

- ทุกครั้งที่มีการเปลี่ยนแปลงโค้ด ให้เพิ่ม 1 รายการในหัวข้อ `## Change Entries`
- ถ้ามีการ merge PR หรือ commit สำคัญ ให้สรุปเพิ่มใน `## Milestones`
- ระบุ `rollback` ทุกครั้ง ว่าสามารถย้อนกลับด้วย commit/tag ไหน
- ทุกการปล่อยงาน (release) ให้บันทึก tag ตาม `docs/RELEASE_CADENCE.md`

## Current Phase

- Phase: `Stabilization + Reporting`
- Updated At: `2026-05-09`
- Owner: `Team + Agent`
- Next Goal:
  - ทำให้รายงานยอดขาย/ใบกำกับภาษีครบและเชื่อมโยงกับการ export
  - คงความถูกต้องของยอดเงินทั้ง flow (Cart -> Checkout -> Order -> Reports)

## Milestones

- [2026-05-09] เพิ่มรายงานใบกำกับภาษีในหน้า `AdminReports` พร้อม export แยก
- [2026-05-09] สร้างเอกสาร workflow และกฎ Agent ระดับโปรเจค
- [2026-05-09] ตั้งมาตรฐาน release cadence + tag format สำหรับ rollback ระดับ release

## Change Entries

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
