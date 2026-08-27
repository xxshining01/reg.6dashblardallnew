export function AIInsightPanel({ insightText, generatedAt }) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, rgba(45, 189, 182, 0.08) 0%, rgba(30, 58, 138, 0.03) 100%)",
        border: "1px solid rgba(45, 189, 182, 0.3)",
        borderRadius: "12px",
        padding: "16px 18px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "8px",
            backgroundColor: "var(--primary-turquoise)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 2px 4px rgba(45, 189, 182, 0.3)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <span
          style={{
            fontWeight: 700,
            fontSize: 15,
            color: "#0F766E",
          }}
        >
          AI Insight Analysis
        </span>
        <span
          style={{
            fontSize: 11,
            color: "#0F766E",
            backgroundColor: "#E6FFFA",
            border: "1px solid rgba(45, 189, 182, 0.3)",
            borderRadius: "12px",
            padding: "1px 8px",
            fontWeight: 600,
          }}
        >
          วิเคราะห์อัตโนมัติ
        </span>
      </div>

      {/* Insight text */}
      <p
        style={{
          fontSize: 13.5,
          color: "var(--ink-main)",
          lineHeight: 1.65,
          margin: 0,
          flex: 1,
          overflow: "auto",
        }}
      >
        {insightText}
      </p>

      {/* Footer */}
      {generatedAt && (
        <p
          style={{
            fontSize: 11.5,
            color: "var(--ink-soft)",
            margin: "8px 0 0",
            borderTop: "1px solid rgba(45, 189, 182, 0.15)",
            paddingTop: 6,
          }}
        >
          อัปเดตล่าสุด: {generatedAt}
        </p>
      )}
    </div>
  );
}
