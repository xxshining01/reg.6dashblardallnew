export function mapBusinessGroup(rawGroup) {
  let g = rawGroup || "";
  
  g = g.replace("กลุ่มธุรกิจ", "");
  g = g.replace("กลุ่มบริการ", "");
  g = g.trim();
  
  if (g.includes("1.1") || g.includes("ไปรษณียภัณฑ์")) return "ไปรษณียภัณฑ์";
  if (g.includes("1.2") || g.toLowerCase().includes("pickup") || g.includes("ขนส่ง") || g.includes("โลจิสติกส์")) return "ขนส่งและโลจิสติกส์";
  if (g.includes("1.4.1") || g.includes("1.4.2") || g.includes("ค้าปลีก") || g.includes("การเงิน")) return "ค้าปลีกและการเงิน";
  if (g.includes("1.3") || g.includes("ระหว่างประเทศ")) return "ระหว่างประเทศ";
  if (g.includes("1.6") || g.includes("รายได้อื่น")) return "รายได้อื่น";
  if (g.includes("1.5") || g.includes("อื่นๆ")) return "อื่นๆ";
  
  return g;
}

export function parseNumber(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).replace(/,/g, '');
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}
