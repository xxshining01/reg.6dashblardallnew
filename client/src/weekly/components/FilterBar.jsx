import dayjs from "dayjs";
import { useFilters } from "../contexts/FilterContext.jsx";

export function FilterBar({ provinces, offices, businessGroups }) {
  const { filters, setFilters, resetFilters } = useFilters();

  const currentMonthValue = dayjs(filters.dateFrom).format("YYYY-MM");

  const handleMonthChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    const selected = dayjs(val + "-01");
    const now = dayjs();
    const dateFrom = selected.format("YYYY-MM-DD");
    const dateTo =
      selected.year() === now.year() && selected.month() === now.month()
        ? now.format("YYYY-MM-DD")
        : selected.endOf("month").format("YYYY-MM-DD");
    setFilters({ dateFrom, dateTo });
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 24px",
        borderBottom: "1px solid var(--border-line)",
        backgroundColor: "var(--surface-soft)",
        flexShrink: 0,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontSize: 13.5,
          color: "var(--ink-main)",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}
      >
        🔍 ตัวกรอง:
      </span>

      {/* จังหวัด */}
      <select
        className="filter-select"
        value={filters.province}
        onChange={(e) =>
          setFilters({ province: e.target.value, office: "ALL" })
        }
      >
        <option value="ALL">ทุกจังหวัด (ทั้งหมด)</option>
        {provinces.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      {/* ที่ทำการ */}
      <select
        className="filter-select"
        value={filters.office}
        onChange={(e) => setFilters({ office: e.target.value })}
        style={{ minWidth: 180 }}
      >
        <option value="ALL">ทุกที่ทำการ (ทั้งหมด)</option>
        {offices.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>

      {/* กลุ่มธุรกิจ */}
      <select
        className="filter-select"
        value={filters.businessGroup}
        onChange={(e) => setFilters({ businessGroup: e.target.value })}
        style={{ minWidth: 180 }}
      >
        <option value="ALL">ทุกกลุ่มธุรกิจ (ทั้งหมด)</option>
        {businessGroups.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>

      <div
        style={{
          width: 1,
          height: 20,
          backgroundColor: "var(--border-line)",
          margin: "0 4px",
          flexShrink: 0,
        }}
      />

      {/* เดือน/ปี */}
      <span style={{ fontSize: 13, color: "var(--ink-soft)", flexShrink: 0 }}>
        เดือน/ปี:
      </span>
      <input
        type="month"
        className="date-input"
        value={currentMonthValue}
        onChange={handleMonthChange}
      />

      {/* Reset */}
      <button
        onClick={resetFilters}
        style={{
          marginLeft: "auto",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--primary-turquoise)",
          backgroundColor: "white",
          border: "1px solid var(--border-line)",
          borderRadius: "6px",
          padding: "6px 12px",
          cursor: "pointer",
          flexShrink: 0,
          transition: "all 0.15s ease",
        }}
      >
        ↺ รีเซ็ต
      </button>
    </div>
  );
}
