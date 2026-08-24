# ข้อกำหนด API และโครงสร้างรับส่งข้อมูล (API Endpoint Specifications & Data Contract)

## 1. ภาพรวมและมาตรฐาน REST API (Overview & Conventions)

* **Base URL Path:** `/api/v1`
* **Content-Type:** `application/json`
* **Authentication:** ไม่มีระบบ Login / ไม่ต้องใช้ Token (Public Scope)
* **Global Query Parameters (ใช้ร่วมกันทุก Analytics Endpoints):**
* `year` (number, required) : ปี ค.ศ. (เช่น 2026)
* `month` (number, optional) : เดือน 1-12
* `province` (string, optional) : ชื่อจังหวัด (เช่น "พิษณุโลก")
* `officeCode` (string, optional) : รหัสที่ทำการ 5 หลัก
* `businessGroup` (string, optional) : กลุ่มธุรกิจ
* `evmService` (string, optional) : กลุ่มบริการ EVM
* `serviceItem` (string, optional) : รายการบริการ
* `dataSource` (string, required) : `"SAP"` | `"BI"` (default: `"SAP"`)
* `timeScale` (string, required) : `"MONTHLY"` | `"WEEKLY"` (default: `"MONTHLY"`)
* `category` (string, required) : `"REVENUE"` | `"EXPENSE"` (default: `"REVENUE"`)



---

## 2. รายละเอียด API Endpoints (API Specifications)

### 2.1 GET `/api/v1/dashboard/summary`

ดึงข้อมูลสรุปผลภาพรวม (Total Summary Cards & Gauges)

* **Response Data Contract (200 OK):**

```json
{
  "success": true,
  "timestamp": "2026-08-20T14:30:00Z",
  "filtersApplied": {
    "year": 2026,
    "month": 4,
    "dataSource": "SAP",
    "timeScale": "MONTHLY"
  },
  "data": {
    "totalRevenue": 128450000.50,
    "totalExpense": 95200000.00,
    "netProfit": 33250000.50,
    "targetAmount": 140000000.00,
    "lastYearRevenue": 115000000.00,
    "targetAchievementPct": 91.75,
    "yoyGrowthPct": 111.69
  }
}

```

---

### 2.2 GET `/api/v1/dashboard/monthly-trend`

ดึงข้อมูลสถิติตรายเดือน/รายสัปดาห์ เทียบปีก่อนและเป้าหมาย สำหรับวาด Performance Bar Chart

* **Response Data Contract (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "month": 1,
      "monthName": "ม.ค.",
      "currentYearAmount": 32000000.00,
      "lastYearAmount": 28000000.00,
      "targetAmount": 30000000.00
    },
    {
      "month": 2,
      "monthName": "ก.พ.",
      "currentYearAmount": 30500000.00,
      "lastYearAmount": 29000000.00,
      "targetAmount": 31000000.00
    }
  ]
}

```

---

### 2.3 GET `/api/v1/dashboard/spatial-map`

ดึงข้อมูลเชิงพื้นที่สำหรับ Leaflet Map Render (จังหวัด/อำเภอ/ตำบล)

* **Response Data Contract (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "officeCode": "65000",
      "officeName": "พิษณุโลก",
      "province": "พิษณุโลก",
      "district": "เมืองพิษณุโลก",
      "subdistrict": "ในเมือง",
      "coordinates": [100.265, 16.821],
      "currentAmount": 12500000.00,
      "lastYearAmount": 11000000.00,
      "targetAmount": 13000000.00,
      "targetAchievementPct": 96.15,
      "yoyGrowthPct": 113.63,
      "statusColor": "GREEN"
    }
  ]
}

```

---

### 2.4 GET `/api/v1/dashboard/ratio-donut`

ดึงสัดส่วนเชิงลึก Multi-level สำหรับ Donut Chart (กลุ่มธุรกิจ -> EVM -> บริการย่อย)

* **Response Data Contract (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "name": "ขนส่งและโลจิสติกส์",
      "value": 82500000.00,
      "percentage": 64.23,
      "children": [
        {
          "name": "ไปรษณีย์ด่วนพิเศษ (EMS)",
          "value": 45000000.00,
          "percentage": 35.03,
          "children": [
            { "name": "EMS ในประเทศ", "value": 30000000.00, "percentage": 23.35 },
            { "name": "EMS World", "value": 15000000.00, "percentage": 11.68 }
          ]
        }
      ]
    }
  ]
}

```

---

### 2.5 GET `/api/v1/dashboard/drilldown-offices`

ดึงข้อมูลตารางเจาะลึกภาพจังหวัดลงรายที่ทำการ

* **Response Data Contract (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "province": "พิษณุโลก",
      "totalCurrentAmount": 45000000,
      "totalLastYearAmount": 40000000,
      "totalTargetAmount": 42000000,
      "yoyGrowthPct": 112.50,
      "offices": [
        {
          "officeCode": "65000",
          "officeName": "พิษณุโลก",
          "currentAmount": 12500000,
          "lastYearAmount": 11000000,
          "targetAmount": 13000000,
          "yoyGrowthPct": 113.63,
          "targetAchievementPct": 96.15
        }
      ]
    }
  ]
}

```

---

### 2.6 GET `/api/v1/dashboard/significant-drops`

ดึงรายการกลุ่มที่ทำการที่มีผลงานลดลงจากปีก่อนอย่างมีนัยสำคัญ

* **Query Parameters เพิ่มเติม:**
* `threshold` (number) : `50` | `70` | `90` (default: `50`)


* **Response Data Contract (200 OK):**

```json
{
  "success": true,
  "thresholdApplied": 50,
  "data": [
    {
      "officeCode": "65110",
      "officeName": "บางระกำ",
      "province": "พิษณุโลก",
      "currentYearAmount": 120000,
      "lastYearAmount": 500000,
      "dropPct": 76.00,
      "severityLevel": "CRITICAL"
    }
  ]
}

```

---

### 2.7 POST `/api/v1/dashboard/export`

Endpoint สำหรับดาวน์โหลดไฟล์รายงาน (Option C: Excel / PDF) พร้อมสอดแทรก Metadata Filter

* **Body Request (JSON):**

```json
{
  "format": "EXCEL", // "EXCEL" | "PDF"
  "filters": {
    "category": "รายได้",
    "year": 2569,
    "month": 1,
    "province": "ตาก",
    "dataSource": "SAP"
  }
}

```

* **Response:** File Stream Buffer (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` หรือ `application/pdf`)

---

### 2.8 POST `/api/v1/admin/upload-file`

Endpoint สำหรับนำเข้าไฟล์ข้อมูล พร้อม Overwrite ไฟล์เดิมตามชื่อไฟล์นำเข้าอัตโนมัติ

* **Content-Type:** `multipart/form-data`
* **Form Field:** `file` (binary) - ตัวอย่างชื่อไฟล์: `sap_1_2026.xlsx` หรือ `ros201_1_2026_w1.xlsx`
* **Response Data Contract (200 OK):**

```json
{
  "success": true,
  "message": "อัปโหลดและ Overwrite ไฟล์ sap_1_2026 สำเร็จ",
  "recordsInserted": 12500
}

```

---