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

// Moves a time of day, staying inside the slots the selects offer.
export function shiftClock(time: string, minutes: number) {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
  const first = Number(TIME_SLOTS[0]!.slice(0, 2)) * 60;
  const last = Number(TIME_SLOTS.at(-1)!.slice(0, 2)) * 60 + 45;
  const clamped = Math.min(Math.max(total, first), last);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}
