export function DashboardSkeleton() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "16px",
        gap: 12,
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Target boxes row */}
      <div style={{ display: "flex", gap: 12, height: 110 }}>
        <div className="skeleton" style={{ flex: 2 }} />
        <div className="skeleton" style={{ flex: 2 }} />
        <div className="skeleton" style={{ flex: 2 }} />
        <div className="skeleton" style={{ flex: 2 }} />
        <div className="skeleton" style={{ flex: 2 }} />
      </div>

      {/* Row 2 */}
      <div style={{ display: "flex", gap: 12, height: 320 }}>
        <div className="skeleton" style={{ flex: 5 }} />
        <div className="skeleton" style={{ flex: 7 }} />
      </div>

      {/* Row 3 */}
      <div style={{ display: "flex", gap: 12, height: 280 }}>
        <div className="skeleton" style={{ flex: 8 }} />
        <div className="skeleton" style={{ flex: 4 }} />
      </div>
    </div>
  );
}

export function DashboardError({ message, onRetry }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 400,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        backgroundColor: "var(--color-paper)",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          backgroundColor: "var(--color-warning-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)", margin: "0 0 4px" }}>
          ไม่สามารถโหลดข้อมูลได้
        </p>
        <p style={{ fontSize: 14, color: "var(--color-ink-soft)", margin: 0 }}>{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "1px solid var(--color-brand)",
            backgroundColor: "var(--color-brand)",
            color: "white",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          ลองใหม่
        </button>
      )}
    </div>
  );
}
