# ข้อกำหนดกลไกคำนวณและประมวลผลข้อมูล (Data Processing & Business Logic Engine Specifications)

## 1. สูตรคำนวณทางคณิตศาสตร์หลักและเงื่อนไข Edge Cases

### 1.1 คำนวณกำไร / ขาดทุนสุทธิ (Net Profit / Loss)

$$\text{Net Profit} = \sum \text{Revenue} - \sum \text{Expense}$$

### 1.2 สัดส่วนผลงานเทียบเป้าหมาย (% Target Achievement)

$$\%\text{ Target Achievement} = \left( \frac{\text{Actual Performance (Current Year)}}{\text{Target Amount}} \right) \times 100$$

### 1.3 สัดส่วนการเติบโตเทียบปีก่อน (% YoY Growth)

$$\%\text{ YoY Growth} = \left( \frac{\text{Actual Performance (Current Year)}}{\text{Actual Performance (Last Year)}} \right) \times 100$$

### 1.4 การจัดการเงื่อนไขขอบเขตทางคณิตศาสตร์ (Mathematical Edge Cases)

* **Division by Zero:** กรณีเป้าหมายเป็น 0 (`Target = 0`) หรือ ผลงานปีก่อนเป็น 0 (`Last Year = 0`) แต่ปีนี้มีผลงานเกิดขึ้น ให้คำนวณผลลัพธ์เป็น **`null` (ค่าว่าง)** และหน้าจอแสดงผลเป็น **"ค่าว่าง" (เว้นว่าง)** ไม่ต้องแสดงข้อความ Error หรือ `N/A`
* **Negative Values:** กรณีตัวเลขสรุปหรือผลงานติดลบ:
* ในการแสดงผล **Gauge Chart** และ **Donut Chart** ให้ Render ส่วนของแผนภาพที่ค่าต่ำสุดคือ $0.00$
* ในส่วนของ **ตัวเลขคำนวณและ Label แสดงผล** ให้แสดงค่าติดลบตามจริง เช่น `-150,000 บาท`


* **Missing Data / Empty States:** แสดงผลเฉพาะส่วนที่มีข้อมูลเท่านั้น หากข้อมูลมีค่าเป็น `0` ให้นับว่ามีข้อมูลและแสดง `0` แต่หากไม่มี Record ข้อมูล (เป็นค่าว่าง) ไม่ต้องนำมาแสดงผล

---

## 2. กลไกการแยกแหล่งข้อมูล (Source Toggle Engine)

### 2.1 สวิตช์ Toggle Source = SAP

* Query ผลรวมจาก Collection `transactions_monthly` โดยกรอง `source_type` รวม 6 กลุ่ม:

$$\text{Revenue}_{\text{SAP\_Total}} = \sum (\text{SAP} + \text{DIT} + \text{FUZE} + \text{LOTTO} + \text{ECOMMERCE} + \text{COD})$$


* เชื่อมโยง `sap_account_code` เข้ากับ `master_services` เพื่อจัดหมวดหมู่กลุ่มธุรกิจ, EVM Service และรายการบริการ

### 2.2 สวิตช์ Toggle Source = BI

* Query ข้อมูลเฉพาะ `source_type = 'BI'` จาก Collection `transactions_monthly`
* ข้อมูล BI ไม่เชื่อมโยงกับกลุ่มธุรกิจ/EVM จำแนกเฉพาะหมวดหมู่ `category` (`REVENUE` หรือ `EXPENSE`) ระดับที่ทำการเท่านั้น
* **หลักการยึดข้อมูล:** ข้อมูลแต่ละแหล่งแยกออกจากกันเด็ดขาด ไม่นำตัวเลขมาคำนวณปะปนกัน แต่ใช้ตัวเลขเป้าหมาย (`targets`) ชุดเดียวกันในการเปรียบเทียบ

---

## 3. กลไกการแสดงผลรายสัปดาห์และการเฉลี่ยเป้าหมาย (Weekly Scaling & Target Prorating)

เมื่อผู้ใช้เลือก **Toggle Timeframe = รายสัปดาห์ (Weekly)**:

### 3.1 การดึงข้อมูล Transaction

* เปลี่ยนการ Query ไปยัง Collection `transactions_weekly` โดยรวมผลงานจาก **รส.201** (`source_type = 'ROS201'`) และ **Pickup Service** (`source_type = 'PICKUP'`)

### 3.2 การถัวเฉลี่ยเป้าหมายรายสัปดาห์ (Prorated Weekly Target Engine)

คำนวณแปลงเป้าหมายรายเดือนให้เป็นเป้าหมายประเมินรายสัปดาห์ตามจำนวนวันจริง ($n$ วัน):

$$\text{Days in Month } (D_m) = \text{GetTotalDaysInMonth}(\text{Year}, \text{Month})$$

$$\text{Daily Target} = \frac{\text{Monthly Target}}{D_m}$$

$$\text{Prorated Weekly Target} = \text{Daily Target} \times n$$

*(โดย $n$ คือ จำนวนวันที่อยู่ในช่วงสัปดาห์นั้นๆ ของเดือน เช่น สัปดาห์เต็ม $n = 7$ วัน หรือสัปดาห์เศษต้น/ปลายเดือน $n = 1-6$ วัน)*

---

## 4. กลไกการตรวจจับที่ทำการผลงานลดลงอย่างมีนัยสำคัญ (Significant Drop Alert Logic)

ประมวลผลสัดส่วนผลงานเทียบปีก่อน ($\%\text{ YoY Growth}$) และจัดกลุ่มแจ้งเตือน ดังนี้:

* **กลุ่ม Drop > 50%:** $\%\text{ YoY Growth} < 50.0$ (ทำผลงานได้น้อยกว่า 50% ของปีก่อน) $\rightarrow$ แสดง Warning Badge (สีส้ม)
* **กลุ่ม Drop > 70%:** $\%\text{ YoY Growth} < 30.0$ (ทำผลงานได้น้อยกว่า 30% ของปีก่อน) $\rightarrow$ แสดง Severe Badge (สีส้มเข้ม)
* **กลุ่ม Drop > 90%:** $\%\text{ YoY Growth} < 10.0$ (ทำผลงานได้น้อยกว่า 10% ของปีก่อน) $\rightarrow$ แสดง Critical Badge (สีแดง)



---

## 5. ตัวอย่าง MongoDB Aggregation Pipeline (Drill-down By Business Group)

```javascript
[
  // Step 1: Match Filters (Year, Month, Office)
  {
    $match: {
      year: 2026,
      month: 4,
      source_type: { $in: ['SAP', 'DIT', 'FUZE', 'LOTTO', 'ECOMMERCE', 'COD'] }
    }
  },
  // Step 2: Lookup Service Master Data
  {
    $lookup: {
      from: 'master_services',
      localField: 'sap_account_code',
      foreignField: 'sap_account_code',
      as: 'service'
    }
  },
  { $unwind: '$service' },
  // Step 3: Group by Business Group -> EVM Service -> Service Item
  {
    $group: {
      _id: {
        business_group: '$service.business_group',
        evm_service: '$service.evm_service',
        service_item: '$service.service_item'
      },
      currentAmount: { $sum: '$amount' }
    }
  },
  // Step 4: Project Output Structure
  {
    $project: {
      _id: 0,
      businessGroup: '$_id.business_group',
      evmService: '$_id.evm_service',
      serviceItem: '$_id.service_item',
      currentAmount: 1
    }
  }
]

```

---