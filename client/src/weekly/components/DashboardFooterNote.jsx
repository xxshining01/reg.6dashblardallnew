export function DashboardFooterNote({ refreshedAt }) {
  return (
    <footer
      style={{
        height: "36px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        borderTop: "1px solid var(--border-line)",
        backgroundColor: "var(--surface-soft)",
        flexShrink: 0,
        flexWrap: "wrap",
        marginTop: "auto",
      }}
    >
      <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
        ⚠️ ข้อมูลนี้เป็นการคำนวณและติดตามผลงานรายสัปดาห์ ปข.6 • ข้อมูลเชื่อมต่อ MongoDB Atlas
      </span>
      {refreshedAt && (
        <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
          โหลดข้อมูลล่าสุด: {refreshedAt}
        </span>
      )}
      <span style={{ fontSize: 11.5, color: "var(--ink-soft)", fontWeight: 500 }}>
        ปข.6 Revenue Weekly Dashboard v2.0
      </span>
    </footer>
  );
}
