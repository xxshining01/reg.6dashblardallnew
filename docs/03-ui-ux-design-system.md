# ข้อกำหนดระบบการออกแบบ UI/UX และเลย์เอาต์ (UI/UX Design System & Layout Specification)

## 1. แนวคิดการออกแบบ (Design Philosophy)

การออกแบบอินเทอร์เฟซอ้างอิงโครงสร้าง Visual Hierarchy และความเด่นชัดของข้อมูลสไตล์ **Binance Platform** โดยปรับเปลี่ยนจาก Dark Canvas เป็น **Light Mode Theme** สำหรับการใช้งานในเชิงบริหาร และเปลี่ยนโทนสีเน้น (Accent Color) เป็น **Accent Turquoise (`#2DBDB6`)**

### หลักการสำคัญ (Key Principles):

1. **Scarcity of Accent:** ใช้สี Accent Turquoise เฉพาะปุ่มหลัก (Primary CTA), สภาวะ Active, และองค์ประกอบเน้นสำคัญ เพื่อไม่ให้รบกวนการอ่านตัวเลข


2. **Financial Data Clarity:** ตัวเลข สถิติ และ % ให้ใช้ Font ตระกูล Tabular/Monospace (เช่น BinancePlex / JetBrains Mono) เพื่อให้หลักตัวเลขตรงกัน อ่านง่าย


3. **Trading Semantics:** ใช้สีเขียว (`#0ECB81`) บอกทิศทางเติบโต/สูงกว่าเป้าหมาย และสีแดง (`#F6465D`) บอกทิศทางลดลง/ต่ำกว่าเป้าหมาย โดยใช้เป็นสีตัวอักษรหรือ Badge ขนาดเล็ก ไม่ใช้เป็นสีพื้นหลังการ์ด



---

## 2. โทนสี ระบบตัวอักษร และการแสดงผลตัวเลข (Tokens & Precision)

### 2.1 Color Tokens

```css
/* Canvas & Surfaces */
--canvas-light: #FFFFFF;         /* พื้นหลังหลักของหน้าเว็บ */
--surface-soft-light: #FAFAFA;    /* พื้นหลังส่วน Footer และพื้นที่ส่วนรอง */
--surface-card-light: #FFFFFF;    /* พื้นหลังการ์ด / Container */
--surface-hover-light: #F5F5F5;   /* สภาวะ Hover บนตาราง / รายการ */

/* Hairlines & Borders */
--hairline-on-light: #EAECEF;     /* เส้นแบ่ง 1px ( Liberal Use )[cite: 1] */
--border-strong: #CDD1D6;         /* เส้นขอบสำหรับ Element เน้น */

/* Brand Accent Tokens */
--primary-turquoise: #2DBDB6;     /* Accent หลัก[cite: 1] */
--primary-active: #25A29C;        /* สภาวะ Press/Hover */
--primary-disabled: #A5E3E0;      /* สภาวะ ปิดใช้งาน */

/* Text & Ink Tokens */
--ink-main: #181A20;              /* หัวข้อหลัก / ตัวเลขเน้น */
--body-text: #474D57;             /* เนื้อหาทั่วไป */
--muted-text: #707A8A;            /* Label / Header ตาราง / หน่วยนับ */

/* Financial Status Tokens (Trading Semantics)[cite: 1] */
--trading-up: #0ECB81;            /* เขียว - เกินเป้า / สูงกว่าปีก่อน[cite: 1] */
--trading-down: #F6465D;          /* แดง - ต่ำกว่าเป้า / ต่ำกว่าปีก่อน[cite: 1] */
--status-warning: #F0B90B;        /* ส้ม - เฝ้าระวัง */

```

### 2.2 Typography Stack

* **Editorial Type (Text/Labels):** `Inter`, `Noto Sans Thai`, `-apple-system`, `sans-serif`
* **Financial Numbers (Data Vis):** `JetBrains Mono`, `IBM Plex Sans`, `BinancePlex` (Tabular Figures)



### 2.3 Number Precision Rules (กฎการแสดงผลตัวเลข)

* **ตาราง Drill-down:** แสดงตัวเลขจำนวนเต็ม พร้อมเครื่องหมาย Comma คั่นหลักหน่วย (เช่น `12,850,400 บาท`)
* **แผนภาพ & KPI Cards:**
* แสดงทศนิยม 2 ตำแหน่งเป็นพื้นฐาน (เช่น `88.50%`)
* หากจำนวนเงินเกิน 1,000,000 บาท ให้เปลี่ยนไปใช้หน่วย **ล้านบาท** พร้อมทศนิยม 2 ตำแหน่ง (เช่น `128.45 ล้านบาท`) เพื่อความสวยงาม



---

## 3. รายละเอียดส่วนประกอบ UI (UI Component Layout Specifications)

### 3.1 Top Navigation & Global Toggle Bar

* Flex Horizontal Bar สูง 64px มีเส้นขอบล่าง 1px `--hairline-on-light`
* **3 Global Toggles:**
1. **Toggle Source:** `[ SAP (+DIT/FUZE/...) | BI ]`
2. **Toggle Category:** `[ รายได้ (Revenue) | ค่าใช้จ่าย (Expense) ]`
3. **Toggle Timeframe:** `[ รายเดือน (Monthly) | รายสัปดาห์ (Weekly) ]`



### 3.2 Filter Controls Panel

* Responsive Bar วางใต้อยู่ด้านบนสุดของ Content Area มี 7 Control Boxes: **ปี**, **เดือน**, **จังหวัด**, **ที่ทำการ**, **กลุ่มธุรกิจ**, **กลุ่มบริการ (EVM)**, และ **บริการ**

### 3.3 Total Summary Cards

* **Card 1 (Total Revenue):** ผลงานรายได้รวม (แสดงหน่วย ล้านบาท หากเกินล้าน) + % เทียบเป้า
* **Card 2 (Total Expense):** ค่าใช้จ่ายรวม + % เทียบเป้า
* **Card 3 (Net Profit / Loss):** กำไร/ขาดทุนสุทธิ (สีกำไรเป็น `--trading-up` สีขาดทุนเป็น `--trading-down`)


* **กรณีติดลบ:** ตัวเลข Display แสดงติดลบตามปกติ

### 3.4 Performance Bar Chart

* Grouped Bar Chart + Target Line Chart แสดงผลงานเทียบปีก่อนและเป้าหมาย
* สลับแกน X ตาม Toggle รายเดือน (ม.ค.-ธ.ค.) หรือ รายสัปดาห์ (สัปดาห์ที่ 1-52)
* ตัวเลข Y-Axis แสดงหน่วย **ล้านบาท**

### 3.5 Achievement & YoY Growth Half-Gauge Charts

* แผนภาพครึ่งวงกลม Gauge แสดง `% ทำได้ตามเป้าหมายปีนี้` และ `% เติบโตเปรียบเทียบผลงานปีก่อน`
* **กรณีผลงานติดลบ:** วาดเข็ม/เกจที่ระดับต่ำสุด 0% แต่ตัวเลข Label คำนวณแสดงผลติดลบตามจริง

### 3.6 Spatial Map Visualization Panel

* React-Leaflet + Custom GeoJSON Layer สลับมุมมอง `[ จังหวัด | อำเภอ | ตำบล ]`
* หมุด Pin / Polygon Color Mapping ตาม % Achievement (สีเขียว: $\ge 100\%$, สีส้ม: $80-99\%$, สีแดง: $< 80\%$)

### 3.7 Multi-level Donut Ratio Chart

* Nested Donut Chart แสดงสัดส่วน 3 ระดับ: **กลุ่มธุรกิจ** (Inner) $\rightarrow$ **กลุ่มบริการ EVM** (Middle) $\rightarrow$ **รายการบริการ** (Outer)
* **กรณีติดลบ:** Render สไลซ์ที่ระดับต่ำสุด 0% แต่แสดง Label ตัวเลขติดลบตามจริง

### 3.8 Spatial & Office Drill-down Table (การเจาะลึกที่ทำการ)

* Expandable Tree Table แสดงผลงานรายจังหวัดเจาะลึกรายที่ทำการ
* ตัวเลขแสดงจำนวนเต็มพร้อม Comma คั่น
* **Rendering Strategy:** โหลด Dataset ทั้งหมดเข้า Client Memory และใช้ Client-side Windowing (TanStack Virtual) เพื่อให้การกด Expand/Collapse และ Scroll ลื่นไหล

### 3.9 Business Group & Service Drill-down Table (การเจาะลึกบริการ)

* Expandable Tree Table (กลุ่มธุรกิจ $\rightarrow$ กลุ่มบริการ EVM $\rightarrow$ รายการบริการ) ตัวเลขแสดงเป็นจำนวนเต็ม

### 3.10 Significant Drop Performance Panel

* Alert Cards แสดงรายการกลุ่มที่ทำการที่มีผลงานต่ำกว่าปีก่อนอย่างมีนัยสำคัญ (`Drop > 50%`, `Drop > 70%`, `Drop > 90%`) พร้อม Red Badge ไฮไลต์



### 3.11 UI State Mechanics (Handling States)

* **Loading State:** แสดง Skeleton Loading สไตล์ Light Mode ระหว่างประมวลผล
* **Empty Data:** แสดงผลเฉพาะส่วนที่มีข้อมูลเท่านั้น (หากมีค่าเป็น 0 ให้นับว่ามีข้อมูล) กรณีเป็นค่าว่างไม่ต้องนำมาแสดง
* **Error State:** หากเกิด Error ให้แสดงกล่องแจ้งเตือน Error ไว้เพื่อรอการปรับปรุงแก้ไขข้อมูลในภายหลัง

---