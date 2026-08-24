# ข้อกำหนดการติดตั้ง ปรับใช้ระบบ และแนวทางทดสอบ (Implementation, Testing & Deployment Guidelines)

## 1. การจัดเตรียมสภาพแวดล้อมระบบ (Environment Setup & Prerequisites)

### 1.1 ซอฟต์แวร์และเครื่องมือที่ต้องใช้ (Tech Stack Requirements)

* **Node.js:** v20.x LTS ขึ้นไป
* **Package Manager:** `pnpm` (แนะนำ) หรือ `npm`
* **Database:** MongoDB Community Server v7.0+ หรือ MongoDB Atlas
* **Containerization:** Docker Engine v24.0+ & Docker Compose v2.20+

### 1.2 การกำหนดค่า Environment Variables (`.env`)

```env
# Server Configuration
PORT=5000
NODE_ENV=production

# Database Connection
MONGODB_URI=mongodb://localhost:27017/region6_dashboard
MONGODB_DB_NAME=region6_dashboard

# Application Limits
MAX_FILE_UPLOAD_SIZE=50MB

```

---

## 2. โครงสร้างโปรเจกต์ (Project Directory Structure)

```text
region6-dashboard/
├── docker-compose.yml
├── README.md
├── client/                     # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/         # UI Components (Cards, Charts, Tables)
│   │   ├── store/              # Zustand Global State Toggles
│   │   ├── utils/              # Export & Number Formatting Helpers
│   │   └── App.jsx
│   └── package.json
└── server/                     # Backend (Node.js Express API)
    ├── src/
    │   ├── config/             # DB & Env Configurations
    │   ├── controllers/        # Analytics & Admin Upload Logic
    │   ├── models/             # Mongoose / MongoDB Schemas
    │   ├── routes/             # REST API Routes
    │   └── services/           # Export Engine (Excel/PDF Generators)
    └── package.json

```

---

## 3. ขั้นตอนการติดตั้งและปรับใช้ระบบด้วย Docker Compose (Deployment Steps)

### 3.1 ตัวอย่างไฟล์ `docker-compose.yml`

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7.0
    container_name: r6_mongodb
    restart: always
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

  backend:
    build: ./server
    container_name: r6_backend
    restart: always
    ports:
      - "5000:5000"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/region6_dashboard
      - PORT=5000
    depends_on:
      - mongodb

  frontend:
    build: ./client
    container_name: r6_frontend
    restart: always
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  mongo_data:

```

### 3.2 คำสั่งสั่งการรันระบบ (Deployment Commands)

```bash
# 1. Clone โปรเจกต์
git clone <repository-url>
cd region6-dashboard

# 2. สั่ง Build และ รันคอนเทนเนอร์ทั้งหมดใน Background
docker-compose up -d --build

# 3. ตรวจสอบ Status การทำงานของคีย์บริการ
docker-compose ps

```

---

## 4. แผนการทดสอบระบบ (Test Cases & Verification Suite)

### 4.1 Test Matrix สำหรับคอร์ฟังก์ชัน

| ID | Test Scenario | Input / Action | Expected Result |
| --- | --- | --- | --- |
| **TC-01** | **File Overwrite Mechanism** | อัปโหลดไฟล์ `sap_1_2026.xlsx` ครั้งที่สอง | ข้อมูลเดิมของ `sap_1_2026` ถูกลบ และใช้ข้อมูลใหม่ทันที โดยจำนวน Record เท่ากับไฟล์ใหม่ |
| **TC-02** | **Division by Zero Handling** | Query ข้อมูลบริการที่ `Target = 0` | ช่อง % Achievement แสดงเป็น **ค่าว่าง** ไม่ขึ้น `NaN` หรือ `Infinity` |
| **TC-03** | **Negative Value Display** | ข้อมูลสรุปขาดทุนสุทธิ (Net Loss) | Gauge แสดงที่เข็ม 0% แต่ Label ตัวเลขติดลบตามจริง เช่น `-120,000 บาท` |
| **TC-04** | **Number Formatting** | สลับดูตาราง Drill-down เทียบกับ KPI Card | ตารางแสดงตัวเลขเต็มคั่น Comma (`12,500,000`), การ์ด/ภาพแสดงหน่วยล้าน (`12.50 ล้านบาท`) |
| **TC-05** | **Export with Metadata** | กด Export Excel (Option C) | ไฟล์ `.xlsx` มี Metadata Header แสดงเงื่อนไข Filter ใน 4 แถวแรกของ Sheet |
| **TC-06** | **Large Table Performance** | กด Expand ดูตารางระดับที่ทำการทุกจังหวัด | Scroll หน้าจอได้ลื่นไหลด้วย Virtualization Engine โดยไม่มีอาการกระตุก |

---