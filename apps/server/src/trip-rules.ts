// Rules shared by search, offer detail and "my trips", so they cannot drift apart.

// Lima has no daylight saving time, so UTC-5 all year.
export function limaClock(now = new Date()) {
  const iso = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
  return { today: iso.slice(0, 10), time: iso.slice(11, 19) };
}

// Postgres `time` columns come back as HH:MM:SS, hand-written ones may be HH:MM.
const withSeconds = (time: string) => (time.length === 5 ? `${time}:00` : time);

// A weekly trip never ends by itself; a one-off one ends after its date and time.
export function hasPassed(
  trip: { date: string | null; time: string },
  clock: ReturnType<typeof limaClock>,
) {
  if (!trip.date) return false;
  return (
    trip.date < clock.today ||
    (trip.date === clock.today && withSeconds(trip.time) < withSeconds(clock.time))
  );
}
