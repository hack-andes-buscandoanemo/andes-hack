// Dates are "YYYY-MM-DD" in Lima, which has no daylight saving time (always UTC-5).
export function limaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(now);
}

export function addDays(date: string, days: number) {
  const moved = new Date(`${date}T12:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

// "18:00" -> "6:00 p. m."
export function clockLabel(time: string) {
  const hours = Number(time.slice(0, 2));
  const suffix = hours < 12 ? "a. m." : "p. m.";
  return `${hours % 12 || 12}:${time.slice(3, 5)} ${suffix}`;
}

export const TIME_SLOTS = Array.from({ length: 18 * 4 }, (_, index) => {
  const minutes = 5 * 60 + index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

// ISO weekdays, as the API expects them: 1 = Monday.
export const WEEKDAYS = [
  { iso: 1, name: "Lunes" },
  { iso: 2, name: "Martes" },
  { iso: 3, name: "Miércoles" },
  { iso: 4, name: "Jueves" },
  { iso: 5, name: "Viernes" },
  { iso: 6, name: "Sábado" },
  { iso: 7, name: "Domingo" },
];

// ISO weekdays [1,2,3,4,5] -> "Lunes a viernes"; [1,3,5] -> "Lunes, miércoles y viernes".
export function daysLabel(days: number[]) {
  const sorted = [...days].sort((x, y) => x - y);
  const names = sorted.map((iso) => WEEKDAYS.find((day) => day.iso === iso)!.name.toLowerCase());
  const consecutive = sorted.every((iso, index) => index === 0 || iso === sorted[index - 1]! + 1);
  const text =
    consecutive && names.length > 2
      ? `${names[0]} a ${names.at(-1)}`
      : names.length > 1
        ? `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`
        : names[0]!;
  return text[0]!.toUpperCase() + text.slice(1);
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// "2026-10-20" -> "Martes 20 de octubre" (a calendar date, so no time zone shift applies).
export function dateLabel(date: string) {
  const day = new Date(`${date}T12:00:00Z`);
  const weekday = WEEKDAYS[(day.getUTCDay() + 6) % 7]!.name;
  return `${weekday} ${day.getUTCDate()} de ${MONTHS[day.getUTCMonth()]}`;
}

// Moves a time of day without crossing midnight.
export function shiftClock(time: string, minutes: number) {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
  const clamped = Math.min(Math.max(total, 0), 23 * 60 + 59);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}
