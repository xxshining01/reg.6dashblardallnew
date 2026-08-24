# โครงสร้างฐานข้อมูลและพจนานุกรมข้อมูล (Database Schema & Data Dictionary Specification)

## 1. ภาพรวมการจัดเก็บข้อมูล (Database Strategy)

ระบบใช้ **MongoDB (NoSQL Engine)** เพื่อรองรับความยืดหยุ่นของโครงสร้างไฟล์นำเข้า (Import) ที่มาจากหลายแหล่งข้อมูล (SAP, BI, DIT, FUZE, LOTTO, ECOMMERCE, COD, รส.201, Pickup) โดยแบ่ง Collection ออกเป็น 3 กลุ่มหลัก:

1. **Master Collections:** เก็บข้อมูลโครงสร้างระดับพื้นที่ (Offices) และผังบริการ/บัญชี (Services)
2. **Transaction Collections:** เก็บผลการดำเนินงานจริง ทั้งระดับรายเดือนและรายสัปดาห์/รายวัน
3. **Target Collections:** เก็บตัวเลขเป้าหมายประจำเดือน

---

## 2. Master Data Collections

### 2.1 Collection: `master_offices`

เก็บข้อมูลโครงสร้างหน่วยงาน ลำดับชั้นจังหวัด-อำเภอ-ตำบล และรหัสไปรษณีย์ 5 หลัก

* **JSON Schema Specification:**

```json
{
  "$jsonSchema": {
    "bsonType": "object",
    "required": ["_id", "office_code", "office_name", "province"],
    "properties": {
      "_id": { "bsonType": "string", "description": "รหัสควบคุม 5 หลัก เช่น '65000' หรือ '60000-00'" },
      "office_code": { "bsonType": "string", "description": "รหัสไปรษณีย์/รหัสที่ทำการ 5 หลัก" },
      "office_name": { "bsonType": "string", "description": "ชื่อที่ทำการ เช่น 'ปณ.เมืองพิษณุโลก', 'สำนักงานเขต 6'" },
      "province": { "bsonType": "string", "description": "ชื่อจังหวัด เช่น 'พิษณุโลก', 'นครสวรรค์'" },
      "district": { "bsonType": "string", "description": "ชื่ออำเภอ" },
      "subdistrict": { "bsonType": "string", "description": "ชื่อตำบล" },
      "is_regional_hq": { "bsonType": "bool", "description": "true หากเป็นรหัสสำนักงานเขต (60000-00)" }
    }
  }
}

```

* **ตัวอย่างข้อมูล (Data Example):**

```json
[
  {
    "_id": "60000-00",
    "office_code": "60000-00",
    "office_name": "สำนักงานไปรษณีย์เขต 6",
    "province": "พิษณุโลก",
    "district": "เมืองพิษณุโลก",
    "subdistrict": "หัวรอ",
    "is_regional_hq": true
  },
  {
    "_id": "65000",
    "office_code": "65000",
    "office_name": "พิษณุโลก",
    "province": "พิษณุโลก",
    "district": "เมืองพิษณุโลก",
    "subdistrict": "ในเมือง",
    "is_regional_hq": false
  }
]

```

---

### 2.2 Collection: `master_services`

เก็บผังลำดับชั้นของบริการทางการเงิน จัดหมวดหมู่ รายได้/ค่าใช้จ่าย, กลุ่มธุรกิจ (Business Group), EVM Service และรายการบริการย่อย พร้อมแมปเข้ากับรหัสบัญชี SAP

* **JSON Schema Specification:**

```json
{
  "$jsonSchema": {
    "bsonType": "object",
    "required": ["_id", "sap_account_code", "category", "business_group", "evm_service", "service_item"],
    "properties": {
      "_id": { "bsonType": "string", "description": "รหัสบัญชี SAP เช่น '410001'" },
      "sap_account_code": { "bsonType": "string", "description": "รหัสบัญชี SAP อ้างอิง Transaction" },
      "category": { "enum": ["REVENUE", "EXPENSE"], "description": "หมวดหมู่หลัก: รายได้ หรือ ค่าใช้จ่าย" },
      "business_group": { "bsonType": "string", "description": "กลุ่มธุรกิจ เช่น 'ขนส่งและโลจิสติกส์', 'บริการไปรษณียภัณฑ์'" },
      "evm_service": { "bsonType": "string", "description": "รูปแบบการบริการ EVM เช่น 'ไปรษณีย์ด่วนพิเศษ (EMS)'" },
      "service_item": { "bsonType": "string", "description": "รายการ/บริการย่อย เช่น 'EMS ในประเทศ'" },
      "is_pickup": { "bsonType": "bool", "description": "true หากเป็นบริการ Pickup พิเศษ" }
    }
  }
}

```

* **ตัวอย่างข้อมูล (Data Example):**

```json
[
  {
    "_id": "410001",
    "sap_account_code": "410001",
    "category": "REVENUE",
    "business_group": "ขนส่งและโลจิสติกส์",
    "evm_service": "ไปรษณีย์ด่วนพิเศษ (EMS)",
    "service_item": "EMS ในประเทศ",
    "is_pickup": false
  },
  {
    "_id": "510002",
    "sap_account_code": "510002",
    "category": "EXPENSE",
    "business_group": "บริหารงานทั่วไป",
    "evm_service": "ค่าใช้จ่ายดำเนินงาน",
    "service_item": "ค่าขนส่งจ้างเหมา",
    "is_pickup": false
  }
]

```

---

## 3. Transaction Collections

### 3.1 Collection: `transactions_monthly`

รวมข้อมูลผลการดำเนินงานรายเดือนจากทุกแหล่งไฟล์ (SAP, BI, DIT, FUZE, LOTTO, ECOMMERCE, COD)

* **รายละเอียดฟิลด์ (Schema Attributes):**
* `_id` String: Identifer อ้างอิงชื่อไฟล์นำเข้าและบรรทัดข้อมูล
* `file_identifier` String: ชื่อไฟล์นำเข้าสำหรับ Overwrite เช่น `"sap_1_2026"`
* `year` Number: ปี ค.ศ. (เช่น 2026)
* `month` Number: เดือน (1-12)
* `office_code` String: รหัสที่ทำการ 5 หลัก (Index Key อ้างอิง `master_offices`)
* `sap_account_code` String: รหัสบัญชี SAP (เป็น null ได้หากมาจาก BI)
* `category` String: `"REVENUE"` | `"EXPENSE"`
* `source_type` String: `"SAP"` | `"BI"` | `"DIT"` | `"FUZE"` | `"LOTTO"` | `"ECOMMERCE"` | `"COD"`
* `amount` Number: จำนวนเงินผลการดำเนินงาน (รองรับทศนิยมไม่จำกัดตำแหน่ง)



---

### 3.2 Collection: `transactions_weekly`

เก็บข้อมูลผลการดำเนินงานรายวัน/รายสัปดาห์ (ข้อมูล รส.201 และ Pickup Service)

* **รายละเอียดฟิลด์ (Schema Attributes):**
* `_id` String: Identifer อ้างอิงชื่อไฟล์นำเข้า
* `file_identifier` String: ชื่อไฟล์นำเข้าสำหรับ Overwrite เช่น `"ros201_1_2026_w1"`
* `year` Number: ปี ค.ศ.
* `month` Number: เดือน (1-12)
* `week_number` Number: สัปดาห์ที่ของปี (ISO Week)
* `office_code` String: รหัสที่ทำการ 5 หลัก
* `sap_account_code` String: รหัสบัญชี SAP (หรือ `"PICKUP_SPECIAL"`)
* `source_type` String: `"ROS201"` | `"PICKUP"`
* `amount` Number: ผลการดำเนินงานรายสัปดาห์/รายวัน



---

## 4. Target Collection

### 4.1 Collection: `targets`

เก็บเป้าหมายรายได้/ค่าใช้จ่าย ประจำปี/เดือน ของแต่ละที่ทำการและรหัสบริการ

* **รายละเอียดฟิลด์ (Schema Attributes):**
* `_id` String: `{year}_{month}_{office_code}_{sap_account_code}`
* `year` Number: ปี ค.ศ.
* `month` Number: เดือน (1-12)
* `office_code` String: รหัสที่ทำการ 5 หลัก
* `sap_account_code` String: รหัสบัญชี SAP
* `target_amount` Number: เป้าหมายทางการเงิน (บาท)



---

## 5. Indexing Strategy Specification

| Collection Name | Index Fields | Index Type | Purpose |
| --- | --- | --- | --- |
| `master_offices` | `{ province: 1, district: 1 }` | Compound | กรองที่ทำการตามพื้นที่ |
| `master_services` | `{ category: 1, business_group: 1 }` | Compound | กรองหมวดหมู่/กลุ่มธุรกิจ |
| `transactions_monthly` | `{ file_identifier: 1 }` | Single Index | ลบเพื่อ Overwrite ไฟล์เดิมได้รวดเร็ว |
| `transactions_monthly` | `{ year: 1, month: 1, office_code: 1, source_type: 1 }` | Compound Index | เร่ง Query Aggregation หน้า Dashboard |
| `transactions_weekly` | `{ file_identifier: 1 }` | Single Index | ลบเพื่อ Overwrite ไฟล์เดิม |
| `targets` | `{ year: 1, month: 1, office_code: 1 }` | Compound Index | ดึงเป้าหมายเปรียบเทียบ |

---