export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// "YYYY-MM-DD" -> "YYYY.MM.DD"
export function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
}

// "YYYY-MM-DD" -> "MM.DD"
export function formatShortDate(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-").map(Number);
  if (!m || !d) return dateStr;
  return `${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
}

// "7:32" -> 452 (seconds). Without a colon, digits are read like a clock display —
// the last two digits are seconds and everything before that is minutes, so "1538" means
// 15:38, "938" means 9:38, and "45" means 0:45. Returns null if unparseable.
export function parseTimeInput(str) {
  const s = String(str ?? "").trim();
  if (!s) return null;
  if (s.includes(":")) {
    const parts = s.split(":").map((p) => p.trim());
    if (parts.length !== 2) return null;
    const m = Number(parts[0]);
    const sec = Number(parts[1]);
    if (!Number.isFinite(m) || !Number.isFinite(sec)) return null;
    return Math.round(m * 60 + sec);
  }
  if (!/^\d+$/.test(s)) return null;
  const secondsPart = s.slice(-2);
  const minutesPart = s.slice(0, -2);
  const m = minutesPart === "" ? 0 : Number(minutesPart);
  return m * 60 + Number(secondsPart);
}

export function weekdayLabel(dateStr) {
  if (!dateStr) return "";
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return days[d.getDay()];
}
