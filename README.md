# SAO CAFE App

แอปร้านกาแฟ / สั่งซื้อ / แอดมิน / แฟรนไชส์ — **React (Vite)** + **Supabase**

## เริ่มต้นอย่างเร็ว (หลังโคลน)

```bash
npm install
cp .env.example .env.local   # Windows: Copy-Item .env.example .env.local
# แก้ .env.local ใส่ VITE_SUPABASE_URL และ VITE_SUPABASE_KEY จาก Supabase → Settings → API
npm run dev
```

เปิดเบราว์เซอร์ที่ **http://localhost:3000** (ค่าเริ่มต้นใน `vite.config.js` — ถ้าเปลี่ยนพอร์ตให้ดูที่เทอร์มินัล)

## เอกสารการโคลนและตั้งค่าฐานข้อมูล

| เอกสาร | ใช้เมื่อไหร่ |
|--------|----------------|
| **[docs/COPY_PROJECT_QUICK_GUIDE.md](./docs/COPY_PROJECT_QUICK_GUIDE.md)** | คัดลอกโฟลเดอร์ไปสร้างโปรเจกต์ใหม่ — เช็กลิสต์สั้น ๆ + สิ่งที่ห้ามนำติดไป |
| **[docs/CLONE_APP.md](./docs/CLONE_APP.md)** | คู่มือเต็ม: Git clone / copy, แยก Supabase·Vercel·Git, ลำดับรัน SQL |
| **[docs/PROJECT_VERIFICATION.md](./docs/PROJECT_VERIFICATION.md)** | เช็กลิสต์ตรวจความเรียบร้อยโปรเจกต์ (build, test, เอกสาร) |
| **[docs/PROJECT_WORKFLOW_REPORT.md](./docs/PROJECT_WORKFLOW_REPORT.md)** | สรุป workflow การทำงานหลักของระบบแบบ end-to-end |
| **[docs/PROJECT_PROGRESS_LOG.md](./docs/PROJECT_PROGRESS_LOG.md)** | บันทึกความคืบหน้า/สิ่งที่อัปเดต/rollback plan ของโปรเจกต์ |
| **[docs/RELEASE_CADENCE.md](./docs/RELEASE_CADENCE.md)** | มาตรฐานรอบการปล่อยงาน + format tag + ขั้นตอน rollback ระดับ release |
| **[AGENTS.md](./AGENTS.md)** | คู่มือย่อสำหรับ Agent/ผู้พัฒนาเพื่อทำงานตาม flow เดียวกัน |
| [ENV_SETUP.md](./ENV_SETUP.md) | ตั้งค่า `.env`, Redirect URL, OAuth |
| [DEPLOY.md](./DEPLOY.md) | Deploy production (Vercel/Netlify) |
| [docs/README.md](./docs/README.md) | ดัชนีเอกสารทั้งหมด |

## สคริปต์หลัก

| คำสั่ง | ความหมาย |
|--------|----------|
| `npm run dev` | รัน dev server |
| `npm run build` | build production |
| `npm run preview` | ดู build แบบ local |
| `npm run test` | Vitest |

---

**หมายเหตุ:** อย่า commit ไฟล์ `.env.local` (มีใน `.gitignore` แล้ว) — ใช้เฉพาะ `.env.example` เป็นแม่แบบ
