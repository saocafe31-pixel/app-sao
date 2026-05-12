# RELEASE CADENCE

แนวทางปล่อยงานแบบเป็นรอบ (รายสัปดาห์/รายเวอร์ชัน) เพื่อให้ติดตามสถานะง่าย, ย้อนกลับเร็ว, และส่งมอบงานได้สม่ำเสมอ

## 1) รูปแบบรอบการปล่อย (Cadence)

- **Weekly Release**: ปล่อยทุกสัปดาห์ (แนะนำทุกวันศุกร์)
- **Patch Release**: ปล่อยฉุกเฉินเมื่อมี bug สำคัญ
- **Monthly Anchor**: สรุปภาพรวมสิ้นเดือนและยืนยัน baseline

## 2) รูปแบบ Tag มาตรฐาน

### 2.1 Weekly tag
- รูปแบบ: `vYYYY.MM.wN`
- ตัวอย่าง: `v2026.05.w2`

> ความหมาย: release สัปดาห์ที่ N ของเดือน YYYY.MM

### 2.2 Patch tag
- รูปแบบ: `vYYYY.MM.wN-pX`
- ตัวอย่าง: `v2026.05.w2-p1`

> ความหมาย: patch ครั้งที่ X ของ weekly release นั้น

### 2.3 Monthly baseline tag (optional)
- รูปแบบ: `vYYYY.MM.base`
- ตัวอย่าง: `v2026.05.base`

## 3) Release Branch Strategy (แนะนำ)

- `main`: โค้ดพร้อมใช้งาน production
- `release/YYYY.MM.wN`: ใช้ทดสอบก่อนตัด tag
- `hotfix/YYYY.MM.wN-pX`: แก้ปัญหาเร่งด่วนหลังปล่อย

## 4) ขั้นตอนปล่อยรายสัปดาห์ (Checklist)

1. อัปเดต `docs/PROJECT_PROGRESS_LOG.md`
   - สรุป milestone ของรอบนั้น
   - ระบุ next direction ชัดเจน
2. ตรวจความถูกต้องยอดเงินทั้ง flow
   - Home -> Cart -> Checkout -> Order -> Reports
3. รันตรวจคุณภาพ
   - lint
   - test (ถ้ามี)
   - smoke test หน้า critical
4. สร้าง release note ย่อ
   - เพิ่มอะไร
   - แก้อะไร
   - known issues
5. สร้าง tag ตามมาตรฐาน
   - เช่น `v2026.05.w2`

## 5) ขั้นตอน Rollback ระดับ Release

## 5.1 Rollback โดยใช้ tag

แนวคิด:
- ระบุ release ที่มีปัญหา (เช่น `v2026.05.w2`)
- ย้อนกลับไป tag ก่อนหน้า (เช่น `v2026.05.w1`)
- deploy ใหม่จาก release ที่เสถียร

## 5.2 Rollback แบบ patch

- ถ้าปัญหาเล็ก: สร้าง `hotfix` และปล่อย `-pX`
- ถ้าปัญหาใหญ่: rollback ทั้ง release แล้วค่อย patch ใน branch แยก

## 6) การบันทึกสถานะลง Progress Log

ทุก release ต้องมีบันทึกใน `docs/PROJECT_PROGRESS_LOG.md` อย่างน้อย:
- release tag
- ขอบเขตการเปลี่ยนแปลง
- verification result
- rollback target

ตัวอย่าง:

```md
### [2026-05-15 18:30] Release v2026.05.w2
- scope: release
- summary:
  - รวมฟีเจอร์รายงานใบกำกับภาษี + export แยก
- verification:
  - lint ผ่าน
  - smoke test หน้า Home/Checkout/AdminReports ผ่าน
- rollback:
  - tag: v2026.05.w1
- next:
  - เพิ่ม filter ตารางใบกำกับล่าสุด
```

## 7) ข้อควรปฏิบัติ

- ห้ามปล่อย release โดยไม่มี tag
- ห้ามปล่อย release โดยไม่มี progress entry
- กรณีเกี่ยวกับยอดเงิน/ใบกำกับภาษี ต้องมีหลักฐาน verification ชัดเจน
