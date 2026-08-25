# ภาพรวมระบบและข้อกำหนดสถาปัตยกรรม (System Overview & Architecture)

## 1. วัตถุประสงค์และขอบเขตของระบบ (System Scope)

ระบบ Dashboard ผลการดำเนินงาน ปข.6 เป็นเว็บแอปพลิเคชันเพื่อการบริหารจัดการและติดตามผลการดำเนินงานทางการเงิน (รายได้/ค่าใช้จ่าย) ของที่ทำการไปรษณีย์ในพื้นที่เขต 6 โดยมีเป้าหมายหลักในการเปรียบเทียบผลงานจริงกับเป้าหมาย (Target) และผลงานช่วงเดียวกันของปีก่อน (YoY) พร้อมทั้งแสดงผลเชิงพื้นที่ (Spatial Map) และการเจาะลึกข้อมูล (Drill-down) หลายระดับ

---

## 2. ข้อกำหนดด้านสิทธิ์และการเข้าถึง (Authorization & Security)

* **การเข้าถึงระบบ (RBAC):** ระบบออกแบบเป็น Single Public/Internal Scope **ไม่มีระบบ Login หรือการจำกัดสิทธิ์เข้าถึง** ผู้ใช้งานทุกคนสามารถมองเห็นและใช้งาน Dashboard ได้เหมือนกันทั้งหมด
* **การจัดการข้อมูล (Data Management):** การนำเข้าไฟล์ข้อมูลเข้าสู่ Database จะดำเนินการโดยตรงโดยผู้ดูแลระบบ (Project Owner) ผ่าน Naming Convention ของไฟล์

---

## 3. สถาปัตยกรรมระบบหลัก (System Architecture)

* **Frontend:** React + Vite, Tailwind CSS, Zustand (State Management), TanStack Virtual (Client-side Windowing)
* **Backend:** Node.js (Express/Fastify API) + MongoDB Aggregate Engine
* **Database:** MongoDB Engine (รองรับโครงสร้างแบบ Document-based)
* **Deployment Model:** รองรับทั้ง Cloud Free Tier Topology (Vercel + Render + MongoDB Atlas) และ On-Premise Docker Compose

---

## 4. สรุปกลไกสำคัญของระบบ (Core System Principles)

### 4.1 การจัดการข้อมูลซ้ำซ้อนและการนำเข้าไฟล์ (File Overwrite Strategy)

ระบบยึดหลัก **Full File Overwrite** โดยพิจารณาจากชื่อไฟล์นำเข้า (Naming Convention):

* **ไฟล์รายเดือน:** ฟอร์แมต `{source}_{month}_{year}` (เช่น `sap_1_2026.xlsx`)
* **ไฟล์รายสัปดาห์:** ฟอร์แมต `{source}_{month}_{year}_w{week}` (เช่น `ros201_1_2026_w1.xlsx`)
* เมื่อมีการอัปโหลดไฟล์ที่มีชื่อและ Filter เดียวกัน ระบบจะลบชุดข้อมูลเดิมทิ้งทั้งไฟล์ และนำข้อมูลจากไฟล์ใหม่เข้าไปแทนที่ทันที

### 4.2 หลักการจัดการ Toggle Data Sources

* ข้อมูลแต่ละแหล่ง (SAP vs BI) แยกออกจากกันเด็ดขาด
* แต่ละ Toggle ดึงข้อมูลจากฐานข้อมูลของตนเอง ไม่มีการนำตัวเลขมาคำนวณปะปนกัน โดยใช้เป้าหมาย (Target) ชุดเดียวกันในการเปรียบเทียบ

---