import dayjs from "dayjs";
import "dayjs/locale/th";

export function excelSerialToISO(serial) {
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return date.toISOString().split("T")[0];
}

export function formatThaiDate(dateISO, pattern = "D MMMM") {
  if (!dateISO) return "";
  const d = dayjs(dateISO).locale("th");
  const buddhistYear = d.year() + 543;
  return `${d.format(pattern)} ${buddhistYear}`;
}

export function formatThaiDateShort(dateISO) {
  if (!dateISO) return "";
  return formatThaiDate(dateISO, "D MMM");
}

export function formatThaiDateDayOfWeek(dateISO) {
  if (!dateISO) return "";
  const d = dayjs(dateISO).locale("th");
  return d.format("D (dd)");
}

export function getThaiMonthYear(dateISO) {
  if (!dateISO) return "";
  const d = dayjs(dateISO).locale("th");
  const buddhistYear = d.year() + 543;
  return `${d.format("MMMM")} ${buddhistYear}`;
}
