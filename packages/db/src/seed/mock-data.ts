import { createHash } from "node:crypto";

import {
  haversineKm,
  matchFreeOffer,
  places,
  type FreeOffer,
  type FreeRequest,
} from "@andes-hack/matching";
import { and, eq, inArray, like } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import {
  community,
  communityMember,
  seatBooking,
  tripMessage,
  tripOffer,
  tripRequest,
  user,
  vehicle,
} from "../schema";

type Database = PgDatabase<PgQueryResultHKT>;

// Fictional people, offers, needs and seat requests to try the app with a full screen. Every
// row is tied to an account of `mock.tejalo.test`, so `removeMockData` takes all of it out and
// leaves the real members and trips of the demo alone. The places are real (OpenStreetMap, from
// places.json); the people, plates and prices are made up. The accounts have no password: they
// fill the screens, nobody signs in as them.

export const MOCK_EMAIL_DOMAIN = "mock.tejalo.test";
const COMMUNITY_SLUG = "comunidad-alfa";

// The same input always gives the same id, so running the seed twice adds nothing.
function idFor(key: string) {
  const hex = createHash("sha1").update(`te-jalo-mock:${key}`).digest("hex");
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const userId = (key: string) => `mock-${key}`;

type PersonRole = "driver" | "passenger" | "both";
interface Person {
  key: string;
  name: string;
  alias: string;
  woman: boolean;
  role: PersonRole;
  mode: "drove_alone" | "drove_with_others" | "car_passenger" | "public_transport" | "taxi_app";
  car?: { make: string; model: string; color: string; plate: string; seats: number };
}

const PEOPLE: Person[] = [
  {
    key: "mateo",
    name: "Mateo Quispe",
    alias: "Mateo Q.",
    woman: false,
    role: "driver",
    mode: "drove_alone",
    car: { make: "Toyota", model: "Corolla", color: "Blanco", plate: "TJM-101", seats: 4 },
  },
  {
    key: "camila",
    name: "Camila Rojas",
    alias: "Camila R.",
    woman: true,
    role: "driver",
    mode: "drove_alone",
    car: { make: "Hyundai", model: "Accent", color: "Gris", plate: "TJM-102", seats: 4 },
  },
  {
    key: "diego",
    name: "Diego Salazar",
    alias: "Diego S.",
    woman: false,
    role: "both",
    mode: "drove_with_others",
    car: { make: "Kia", model: "Rio", color: "Rojo", plate: "TJM-103", seats: 3 },
  },
  {
    key: "valeria",
    name: "Valeria Torres",
    alias: "Valeria T.",
    woman: true,
    role: "driver",
    mode: "drove_alone",
    car: { make: "Nissan", model: "Versa", color: "Azul", plate: "TJM-104", seats: 4 },
  },
  {
    key: "andres",
    name: "Andrés Paredes",
    alias: "Andrés P.",
    woman: false,
    role: "driver",
    mode: "drove_alone",
    car: { make: "Chevrolet", model: "Sail", color: "Negro", plate: "TJM-105", seats: 4 },
  },
  {
    key: "luciana",
    name: "Luciana Vega",
    alias: "Luciana V.",
    woman: true,
    role: "both",
    mode: "drove_with_others",
    car: { make: "Suzuki", model: "Swift", color: "Blanco", plate: "TJM-106", seats: 3 },
  },
  {
    key: "jorge",
    name: "Jorge Huamán",
    alias: "Jorge H.",
    woman: false,
    role: "driver",
    mode: "drove_alone",
    car: { make: "Toyota", model: "Yaris", color: "Plata", plate: "TJM-107", seats: 5 },
  },
  {
    key: "sofia",
    name: "Sofía Mendoza",
    alias: "Sofía M.",
    woman: true,
    role: "passenger",
    mode: "taxi_app",
  },
  {
    key: "renzo",
    name: "Renzo Castillo",
    alias: "Renzo C.",
    woman: false,
    role: "passenger",
    mode: "public_transport",
  },
  {
    key: "fiorella",
    name: "Fiorella Díaz",
    alias: "Fiorella D.",
    woman: true,
    role: "passenger",
    mode: "public_transport",
  },
  {
    key: "gabriel",
    name: "Gabriel Ramos",
    alias: "Gabriel R.",
    woman: false,
    role: "passenger",
    mode: "taxi_app",
  },
  {
    key: "daniela",
    name: "Daniela Flores",
    alias: "Daniela F.",
    woman: true,
    role: "passenger",
    mode: "car_passenger",
  },
  {
    key: "luis",
    name: "Luis Campos",
    alias: "Luis C.",
    woman: false,
    role: "passenger",
    mode: "public_transport",
  },
  {
    key: "andrea",
    name: "Andrea Núñez",
    alias: "Andrea N.",
    woman: true,
    role: "passenger",
    mode: "public_transport",
  },
  {
    key: "brayan",
    name: "Brayan Ccopa",
    alias: "Brayan C.",
    woman: false,
    role: "passenger",
    mode: "public_transport",
  },
];

// A real place: a meeting point of places.json, or the community's headquarters ("cer").
function placeOf(id: string) {
  if (id === "cer") {
    const [destination] = places.destinations;
    return {
      lat: destination!.lat,
      lng: destination!.lng,
      label: destination!.name,
      zoneId: "san-isidro",
    };
  }
  const point = places.meetingPoints.find((candidate) => candidate.id === id);
  if (!point) throw new Error(`places.json no tiene ${id}`);
  return { lat: point.lat, lng: point.lng, label: point.name, zoneId: point.zoneId };
}

interface MockOffer {
  key: string;
  driver: string;
  from: string;
  to: string;
  at: string;
  days: number[] | null;
  // Days from today (Lima) for a one-off trip.
  inDays?: number;
  seats: number;
  priceCents: number;
  methods: ("yape" | "cash")[];
  detour: 0 | 5 | 10;
  womenOnly?: boolean;
  note?: string;
}

const WEEK = [1, 2, 3, 4, 5];

const OFFERS: MockOffer[] = [
  {
    key: "mateo-ida",
    driver: "mateo",
    from: "la-molina-plaza-de-armas",
    to: "cer",
    at: "07:00",
    days: WEEK,
    seats: 3,
    priceCents: 600,
    methods: ["yape", "cash"],
    detour: 5,
    note: "Salgo puntual, paso por la Javier Prado.",
  },
  {
    key: "mateo-vuelta",
    driver: "mateo",
    from: "cer",
    to: "la-molina-plaza-de-armas",
    at: "18:00",
    days: WEEK,
    seats: 3,
    priceCents: 600,
    methods: ["yape", "cash"],
    detour: 5,
  },
  {
    key: "camila-ida",
    driver: "camila",
    from: "san-borja-estacion-san-borja-sur",
    to: "cer",
    at: "07:30",
    days: WEEK,
    seats: 3,
    priceCents: 400,
    methods: ["yape"],
    detour: 5,
  },
  {
    key: "camila-vuelta",
    driver: "camila",
    from: "cer",
    to: "san-borja-estacion-san-borja-sur",
    at: "18:15",
    days: WEEK,
    seats: 3,
    priceCents: 400,
    methods: ["yape"],
    detour: 5,
  },
  {
    key: "diego-ida",
    driver: "diego",
    from: "santiago-de-surco-parque-de-la-amistad",
    to: "jesus-maria-campo-de-marte",
    at: "07:15",
    days: WEEK,
    seats: 2,
    priceCents: 500,
    methods: ["cash"],
    detour: 10,
  },
  {
    key: "valeria-ida",
    driver: "valeria",
    from: "miraflores-parque-kennedy",
    to: "cer",
    at: "08:00",
    days: WEEK,
    seats: 3,
    priceCents: 350,
    methods: ["yape"],
    detour: 0,
    womenOnly: true,
    note: "Solo con pasajeras mujeres.",
  },
  {
    key: "andres-ida",
    driver: "andres",
    from: "santa-anita-estacion-ovalo-santa-anita",
    to: "cercado-de-lima-plaza-mayor",
    at: "06:45",
    days: WEEK,
    seats: 3,
    priceCents: 500,
    methods: ["yape", "cash"],
    detour: 5,
  },
  {
    key: "luciana-ida",
    driver: "luciana",
    from: "barranco-parque-municipal",
    to: "san-isidro-parque-el-olivar",
    at: "07:45",
    days: [1, 3, 5],
    seats: 2,
    priceCents: 300,
    methods: ["yape"],
    detour: 5,
  },
  {
    key: "jorge-ida",
    driver: "jorge",
    from: "san-juan-de-lurigancho-estacion-los-jardines",
    to: "cercado-de-lima-estacion-colmena",
    at: "06:30",
    days: WEEK,
    seats: 4,
    priceCents: 400,
    methods: ["cash"],
    detour: 10,
  },
  {
    key: "andres-manana",
    driver: "andres",
    from: "surquillo-municipalidad",
    to: "cer",
    at: "08:15",
    days: null,
    inDays: 1,
    seats: 2,
    priceCents: 450,
    methods: ["yape"],
    detour: 5,
  },
];

type FallbackMode = "drive_alone" | "taxi_app" | "public_transport" | "picked_up" | "other";

interface MockRequest {
  key: string;
  passenger: string;
  from: string;
  to: string;
  window: [string, string];
  days: number[];
  direction: "outbound" | "return";
  fallback: FallbackMode;
  womenOnly?: boolean;
  // The trip the person asked a seat on, and how it stands.
  seat?: { offer: string; status: "pending" | "accepted" | "rejected" };
}

const REQUESTS: MockRequest[] = [
  {
    key: "sofia-ida",
    passenger: "sofia",
    from: "san-borja-municipalidad",
    to: "cer",
    window: ["07:15", "07:45"],
    days: WEEK,
    direction: "outbound",
    fallback: "taxi_app",
    seat: { offer: "camila-ida", status: "accepted" },
  },
  {
    key: "sofia-vuelta",
    passenger: "sofia",
    from: "cer",
    to: "san-borja-municipalidad",
    window: ["17:45", "18:30"],
    days: WEEK,
    direction: "return",
    fallback: "taxi_app",
    seat: { offer: "camila-vuelta", status: "pending" },
  },
  {
    key: "renzo-ida",
    passenger: "renzo",
    from: "la-molina-parque-la-balsa",
    to: "cer",
    window: ["06:45", "07:30"],
    days: WEEK,
    direction: "outbound",
    fallback: "public_transport",
    seat: { offer: "mateo-ida", status: "accepted" },
  },
  {
    key: "renzo-vuelta",
    passenger: "renzo",
    from: "cer",
    to: "la-molina-parque-la-balsa",
    window: ["17:45", "18:30"],
    days: WEEK,
    direction: "return",
    fallback: "public_transport",
  },
  {
    key: "fiorella-ida",
    passenger: "fiorella",
    from: "miraflores-estacion-ricardo-palma",
    to: "cer",
    window: ["07:45", "08:15"],
    days: WEEK,
    direction: "outbound",
    fallback: "public_transport",
    womenOnly: true,
    seat: { offer: "valeria-ida", status: "pending" },
  },
  {
    key: "gabriel-ida",
    passenger: "gabriel",
    from: "santa-anita-parque-virgen-del-carmen",
    to: "cercado-de-lima-plaza-mayor",
    window: ["06:30", "07:15"],
    days: WEEK,
    direction: "outbound",
    fallback: "taxi_app",
    seat: { offer: "andres-ida", status: "pending" },
  },
  {
    key: "daniela-ida",
    passenger: "daniela",
    from: "santiago-de-surco-cc-el-trigal",
    to: "jesus-maria-campo-de-marte",
    window: ["07:00", "07:45"],
    days: WEEK,
    direction: "outbound",
    fallback: "picked_up",
    seat: { offer: "diego-ida", status: "accepted" },
  },
  {
    key: "luis-ida",
    passenger: "luis",
    from: "barranco-estacion-bulevar",
    to: "san-isidro-parque-el-olivar",
    window: ["07:30", "08:15"],
    days: [1, 3, 5],
    direction: "outbound",
    fallback: "public_transport",
    seat: { offer: "luciana-ida", status: "pending" },
  },
  {
    key: "andrea-ida",
    passenger: "andrea",
    from: "san-juan-de-lurigancho-estacion-los-postes",
    to: "cercado-de-lima-estacion-colmena",
    window: ["06:15", "07:00"],
    days: WEEK,
    direction: "outbound",
    fallback: "public_transport",
    seat: { offer: "jorge-ida", status: "accepted" },
  },
  // Nobody drives near this one yet: it feeds the unmet-demand figures.
  {
    key: "brayan-ida",
    passenger: "brayan",
    from: "chorrillos-estacion-teran",
    to: "cer",
    window: ["07:30", "08:30"],
    days: WEEK,
    direction: "outbound",
    fallback: "public_transport",
  },
];

const CHATS: { offer: string; passenger: string; lines: ["driver" | "passenger", string][] }[] = [
  {
    offer: "camila-ida",
    passenger: "sofia",
    lines: [
      ["passenger", "Hola Camila, estaré en el punto a las 7:25"],
      ["driver", "Perfecto, llego en 5 min"],
      ["driver", "Ya salí"],
    ],
  },
  {
    offer: "mateo-ida",
    passenger: "renzo",
    lines: [
      ["driver", "Buenos días Renzo, hoy salgo 5 min tarde"],
      ["passenger", "Sin problema, te espero"],
    ],
  },
  {
    offer: "jorge-ida",
    passenger: "andrea",
    lines: [
      ["passenger", "Estoy en la estación Los Postes"],
      ["driver", "Llego en 5 min"],
    ],
  },
];

const QUICK = new Set([
  "Ya salí",
  "Estoy en el punto de encuentro",
  "Llego en 5 min",
  "Hoy no podré ir",
]);

// Calendar date in Lima, shifted by some days; en-CA formats as YYYY-MM-DD.
function limaDate(shiftDays: number) {
  const base = new Date(Date.now() + shiftDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(base);
}

// The streets between two points from OpenStreetMap data (OSRM), or a straight line when the
// service does not answer, so the seed never fails on the network.
async function streetRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const straight = () => {
    const km = haversineKm(from, to);
    const steps = Math.min(399, Math.max(2, Math.ceil(km * 10)));
    return {
      path: Array.from({ length: steps + 1 }, (_, i): [number, number] => [
        from.lat + ((to.lat - from.lat) * i) / steps,
        from.lng + ((to.lng - from.lng) * i) / steps,
      ]),
      minutes: Math.max(1, Math.round((km / 25) * 60)),
      km,
      approximate: true,
    };
  };
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return straight();
    const body = (await response.json()) as {
      routes?: {
        duration: number;
        distance: number;
        geometry: { coordinates: [number, number][] };
      }[];
    };
    const [best] = body.routes ?? [];
    if (!best || best.geometry.coordinates.length < 2) return straight();
    const all = best.geometry.coordinates.map(([lng, lat]): [number, number] => [lat, lng]);
    const step = (all.length - 1) / Math.min(all.length - 1, 399);
    const path =
      all.length <= 400 ? all : Array.from({ length: 400 }, (_, i) => all[Math.round(i * step)]!);
    return {
      path,
      minutes: Math.max(1, Math.round(best.duration / 60)),
      km: Math.round(best.distance / 100) / 10,
      approximate: false,
    };
  } catch {
    return straight();
  }
}

export interface MockReport {
  users: number;
  offers: number;
  requests: number;
  seatRequests: number;
  messages: number;
}

export async function seedMockData(db: Database): Promise<MockReport> {
  const [alfa] = await db
    .select({ id: community.id })
    .from(community)
    .where(eq(community.slug, COMMUNITY_SLUG))
    .limit(1);
  if (!alfa) throw new Error("No existe Comunidad Alfa: ejecuta antes `bun db:seed`.");

  const now = new Date();
  const report: MockReport = { users: 0, offers: 0, requests: 0, seatRequests: 0, messages: 0 };

  // People: accounts without a password, their membership of the community and their cars.
  const users = await db
    .insert(user)
    .values(
      PEOPLE.map((person) => ({
        id: userId(person.key),
        name: person.name,
        email: `${person.key}@${MOCK_EMAIL_DOMAIN}`,
        emailVerified: true,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: user.id });
  report.users = users.length;

  await db
    .insert(communityMember)
    .values(
      PEOPLE.map((person) => ({
        communityId: alfa.id,
        userId: userId(person.key),
        verificationMethod: "join_code" as const,
        alias: person.alias,
        usualMode: person.mode,
        travelRole: person.role,
        identifiesAsWoman: person.woman,
        consentVersion: "v1",
        consentAt: now,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(vehicle)
    .values(
      PEOPLE.flatMap((person) =>
        person.car
          ? [{ id: idFor(`vehicle:${person.key}`), ownerId: userId(person.key), ...person.car }]
          : [],
      ),
    )
    .onConflictDoNothing();

  // Proposals of the drivers: one trip per row, with its street route.
  const routes = new Map<string, Awaited<ReturnType<typeof streetRoute>>>();
  for (const offer of OFFERS) {
    const [from, to] = [placeOf(offer.from), placeOf(offer.to)];
    const route = await streetRoute(from, to);
    routes.set(offer.key, route);
    const created = await db
      .insert(tripOffer)
      .values({
        id: idFor(`offer:${offer.key}`),
        communityId: alfa.id,
        driverId: userId(offer.driver),
        vehicleId: idFor(`vehicle:${offer.driver}`),
        direction: "outbound",
        originZoneId: from.zoneId,
        originLat: from.lat,
        originLng: from.lng,
        originLabel: from.label,
        destLat: to.lat,
        destLng: to.lng,
        destLabel: to.label,
        routePath: route.path,
        routeMinutes: route.minutes,
        routeKm: route.km,
        routeApproximate: route.approximate,
        departureTime: offer.at,
        daysOfWeek: offer.days,
        date: offer.days ? null : limaDate(offer.inDays ?? 1),
        seatsTotal: offer.seats,
        maxDetourMinutes: offer.detour,
        womenOnly: offer.womenOnly ?? false,
        note: offer.note ?? null,
        priceCents: offer.priceCents,
        paymentMethods: offer.methods,
      })
      .onConflictDoNothing()
      .returning({ id: tripOffer.id });
    report.offers += created.length;
  }

  // Needs of the passengers, and the seats they asked for on the trips that fit them.
  const womanOf = new Map(PEOPLE.map((person) => [person.key, person.woman]));
  for (const request of REQUESTS) {
    const [from, to] = [placeOf(request.from), placeOf(request.to)];
    const offerFor = request.seat
      ? OFFERS.find((offer) => offer.key === request.seat!.offer)!
      : null;
    const route = offerFor ? routes.get(offerFor.key)! : null;
    const freeRequest: FreeRequest = {
      origin: from,
      destination: to,
      windowStart: request.window[0],
      windowEnd: request.window[1],
      date: null,
      daysOfWeek: request.days,
      maxWalkMinutes: 15,
      womenOnly: request.womenOnly ?? false,
      passengerIsWoman: womanOf.get(request.passenger) ?? false,
    };
    const freeOffer: FreeOffer | null =
      offerFor && route
        ? {
            id: idFor(`offer:${offerFor.key}`),
            path: route.path,
            minutes: route.minutes,
            departureTime: offerFor.at,
            date: offerFor.days ? null : limaDate(offerFor.inDays ?? 1),
            daysOfWeek: offerFor.days,
            seatsFree: offerFor.seats,
            womenOnly: offerFor.womenOnly ?? false,
          }
        : null;
    const outcome = freeOffer ? matchFreeOffer(freeRequest, freeOffer) : null;
    const match = outcome && "match" in outcome ? outcome.match : null;
    const requestId = idFor(`request:${request.key}`);

    const created = await db
      .insert(tripRequest)
      .values({
        id: requestId,
        communityId: alfa.id,
        passengerId: userId(request.passenger),
        direction: request.direction,
        originZoneId: from.zoneId,
        originLat: from.lat,
        originLng: from.lng,
        originLabel: from.label,
        destLat: to.lat,
        destLng: to.lng,
        destLabel: to.label,
        windowStart: request.window[0],
        windowEnd: request.window[1],
        daysOfWeek: request.days,
        maxWalkMinutes: 15,
        fallbackMode: request.fallback,
        womenOnly: request.womenOnly ?? false,
        hadResults: request.seat ? Boolean(match) : false,
      })
      .onConflictDoNothing()
      .returning({ id: tripRequest.id });
    report.requests += created.length;

    if (!request.seat || !match || !offerFor) continue;
    const seat = await db
      .insert(seatBooking)
      .values({
        id: idFor(`booking:${request.key}`),
        offerId: idFor(`offer:${offerFor.key}`),
        requestId,
        passengerId: userId(request.passenger),
        pickupLat: match.pickup.lat,
        pickupLng: match.pickup.lng,
        pickupLabel: `Cerca de ${from.label}`.slice(0, 160),
        dropoffLat: match.dropoff.lat,
        dropoffLng: match.dropoff.lng,
        dropoffLabel: `Cerca de ${to.label}`.slice(0, 160),
        pickupAt: match.pickupAt,
        detourMinutes: 0,
        walkMinutes: match.walkMinutes,
        status: request.seat.status,
        decidedAt: request.seat.status === "pending" ? null : now,
      })
      .onConflictDoNothing()
      .returning({ id: seatBooking.id });
    report.seatRequests += seat.length;
  }

  // The coordination chat of the accepted trips.
  for (const chat of CHATS) {
    const offer = OFFERS.find((candidate) => candidate.key === chat.offer)!;
    const rows = chat.lines.map(([who, body], index) => ({
      id: idFor(`message:${chat.offer}:${index}`),
      offerId: idFor(`offer:${chat.offer}`),
      senderId: userId(who === "driver" ? offer.driver : chat.passenger),
      kind: QUICK.has(body) ? ("quick" as const) : ("text" as const),
      body,
      createdAt: new Date(now.getTime() - (chat.lines.length - index) * 4 * 60 * 1000),
    }));
    const created = await db.insert(tripMessage).values(rows).onConflictDoNothing().returning({
      id: tripMessage.id,
    });
    report.messages += created.length;
  }
  return report;
}

// Takes out every row of the mock accounts, and only theirs.
export async function removeMockData(db: Database) {
  const mock = await db
    .select({ id: user.id })
    .from(user)
    .where(like(user.email, `%@${MOCK_EMAIL_DOMAIN}`));
  const ids = mock.map((row) => row.id);
  if (ids.length === 0) return { users: 0 };

  const offers = await db
    .select({ id: tripOffer.id })
    .from(tripOffer)
    .where(inArray(tripOffer.driverId, ids));
  const offerIds = offers.map((row) => row.id);
  // A seat of a mock passenger on a real trip, and any seat on a mock trip, go first: the offers
  // and needs they point to cannot be deleted while a booking holds them.
  await db.delete(seatBooking).where(inArray(seatBooking.passengerId, ids));
  if (offerIds.length > 0)
    await db.delete(seatBooking).where(inArray(seatBooking.offerId, offerIds));
  if (offerIds.length > 0) await db.delete(tripOffer).where(inArray(tripOffer.id, offerIds));
  await db.delete(tripRequest).where(inArray(tripRequest.passengerId, ids));
  // The cascades take the memberships, the cars, the messages and the live positions with them.
  await db
    .delete(user)
    .where(and(inArray(user.id, ids), like(user.email, `%@${MOCK_EMAIL_DOMAIN}`)));
  return { users: ids.length };
}
