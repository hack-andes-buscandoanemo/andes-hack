import {
  bestInsertion,
  type InfeasibleReason,
  type Insertion,
  type OfferMatch,
  type OfferRoute,
  rankOffersForRequest,
  type RideRequest,
  routeFits,
  timeRoute,
} from "./insertion";
import { avoidsCarTrip, type FallbackMode } from "./metrics";
import type { TravelTimeModel } from "./travel-time";

// Assigns the seats of one day among every passenger still looking for one. Nothing is
// written: the plan is a recommendation each driver still accepts or rejects (US-019).
//
// Regret insertion builds a first plan, then a local search moves passengers between cars
// while the objective improves. No step is random, so the same day gives the same plan.

// An open need, or one with a pending request. `id` is the need's.
export interface DayRequest extends RideRequest {
  id: string;
  // "Si no encuentras viaje, ¿cómo irías?" (US-013).
  fallbackMode: FallbackMode;
}

export interface DayInstance {
  // The day, "YYYY-MM-DD"; every route is timed on it.
  date: string;
  // Their accepted passengers stay where they are; rejected pairs are never proposed.
  offers: readonly OfferRoute[];
  requests: readonly DayRequest[];
}

// What comes first. Seating first whoever would drive can leave without a seat someone who
// today rides the bus and looks for safety; "passengers" seats as many people as possible
// and only then counts the car trips avoided.
export type Priority = "car_trips_avoided" | "passengers";

export interface OptimizeOptions {
  priority?: Priority;
  // How long the local search may run; the plan it has by then is returned.
  timeBudgetMs?: number;
}

export interface Assignment {
  requestId: string;
  passengerId: string;
  offerId: string;
  meetingPointId: string;
  // Index of the stop among all the driver's passengers, those already accepted included.
  position: number;
  pickupAt: string;
  arrivalAt: string;
  // How much shorter the driver's final route would be without this passenger. A stop on
  // another passenger's way adds 0, so these need not add up to the objective's detour.
  detourMinutes: number;
  walkMinutes: number;
  avoidsCarTrip: boolean;
}

export interface Unassigned {
  requestId: string;
  passengerId: string;
  reason: InfeasibleReason;
}

// What the plan maximises, in this order: car trips avoided, then passengers seated, then
// fewer minutes of detour for the drivers, then fewer minutes on foot.
export interface Objective {
  carTripsAvoided: number;
  passengersMatched: number;
  // Each driver's, against the trip with the passengers they had already accepted.
  detourMinutes: number;
  walkMinutes: number;
}

// How many would otherwise drive alone or take a taxi or app, ride public transport, or go
// some other way.
export interface ByFallback {
  wouldDrive: number;
  publicTransport: number;
  other: number;
}

export interface DayPlan {
  assignments: Assignment[];
  unassigned: Unassigned[];
  objective: Objective;
  // Who is seated and who is left out, group by group: the priority favours one of them.
  metrics: { matched: ByFallback; unassigned: ByFallback };
  // How long the plan took to compute.
  durationMs: number;
}

function byFallback(requests: readonly DayRequest[]): ByFallback {
  const wouldDrive = requests.filter((request) => avoidsCarTrip(request.fallbackMode)).length;
  const publicTransport = requests.filter(
    (request) => request.fallbackMode === "public_transport",
  ).length;
  return { wouldDrive, publicTransport, other: requests.length - wouldDrive - publicTransport };
}

// Someone the plan seats, with the minutes they walk to their stop.
interface Rider {
  request: DayRequest;
  walkMinutes: number;
}

// An offer as the plan stands: the route with every stop, who the plan seats at each
// (null where the driver had already accepted someone), and its share of the objective.
interface Car {
  route: OfferRoute;
  riders: readonly (Rider | null)[];
  score: Objective;
}

const nothing: Objective = {
  carTripsAvoided: 0,
  passengersMatched: 0,
  detourMinutes: 0,
  walkMinutes: 0,
};

const plus = (a: Objective, b: Objective, sign = 1): Objective => ({
  carTripsAvoided: a.carTripsAvoided + sign * b.carTripsAvoided,
  passengersMatched: a.passengersMatched + sign * b.passengersMatched,
  detourMinutes: a.detourMinutes + sign * b.detourMinutes,
  walkMinutes: a.walkMinutes + sign * b.walkMinutes,
});

// Positive when `a` is the better plan.
function compare(a: Objective, b: Objective, priority: Priority) {
  const carTrips = a.carTripsAvoided - b.carTripsAvoided;
  const passengers = a.passengersMatched - b.passengersMatched;
  return (
    (priority === "passengers" ? passengers || carTrips : carTrips || passengers) ||
    b.detourMinutes - a.detourMinutes ||
    b.walkMinutes - a.walkMinutes
  );
}

interface Candidate {
  request: DayRequest;
  // Its feasible offers, best first, on the routes as they stand.
  matches: readonly OfferMatch[];
}

// Minutes lost if the best seat goes to someone else; with one option left, all of them.
const regret = ({ matches }: Candidate) =>
  matches.length > 1
    ? matches[1]!.detourMinutes - matches[0]!.detourMinutes
    : Number.POSITIVE_INFINITY;

const descending = (a: number, b: number) => (a === b ? 0 : a > b ? -1 : 1);

// Who is seated next: whoever would otherwise make the trip by car, unless passengers come
// first, then whoever has the most to lose by waiting, then whoever costs the driver the
// fewest minutes.
const seatsFirst = (priority: Priority) => (a: Candidate, b: Candidate) =>
  (priority === "car_trips_avoided"
    ? descending(
        Number(avoidsCarTrip(a.request.fallbackMode)),
        Number(avoidsCarTrip(b.request.fallbackMode)),
      )
    : 0) ||
  descending(regret(a), regret(b)) ||
  a.matches[0]!.detourMinutes - b.matches[0]!.detourMinutes;

export function optimizeDay(
  instance: DayInstance,
  model: TravelTimeModel,
  options: OptimizeOptions = {},
): DayPlan {
  const { date } = instance;
  const { priority = "car_trips_avoided", timeBudgetMs = 1000 } = options;
  const start = performance.now();
  const accepted = new Map(
    instance.offers.map((offer) => [offer.id, timeRoute(offer, date, model).minutes]),
  );

  function car(route: OfferRoute, riders: readonly (Rider | null)[]): Car {
    const seated = riders.filter((rider) => rider !== null);
    if (seated.length === 0) return { route, riders, score: nothing };
    const minutes = timeRoute(route, date, model).minutes;
    const score = {
      carTripsAvoided: seated.filter((rider) => avoidsCarTrip(rider.request.fallbackMode)).length,
      passengersMatched: seated.length,
      detourMinutes: Math.round(minutes - accepted.get(route.id)!),
      walkMinutes: seated.reduce((sum, rider) => sum + rider.walkMinutes, 0),
    };
    return { route, riders, score };
  }

  function seat(current: Car, request: DayRequest, insertion: Insertion): Car {
    const { meetingPointId, position, walkMinutes } = insertion;
    const { windowStart, windowEnd } = request;
    const stop = { meetingPointId, windowStart, windowEnd };
    return car(
      { ...current.route, passengers: current.route.passengers.toSpliced(position, 0, stop) },
      current.riders.toSpliced(position, 0, { request, walkMinutes }),
    );
  }

  function withRider(current: Car, request: DayRequest): Car | null {
    const insertion = bestInsertion(current.route, request, model, date);
    return insertion.feasible ? seat(current, request, insertion) : null;
  }

  // Two passengers who would each reach the destination too early alone may fit together:
  // the first goes to every stop and position, and the second's insertion checks the whole
  // route, the first's window included.
  function* withPair(current: Car, first: DayRequest, second: DayRequest): Generator<Car> {
    const { passengers, seatsTotal } = current.route;
    if (passengers.length + 2 > seatsTotal) return;
    const { windowStart, windowEnd } = first;
    for (const point of model.walkableMeetingPoints(first.originZoneId, first.maxWalkMinutes)) {
      for (let position = 0; position <= passengers.length; position++) {
        const stop = { meetingPointId: point.meetingPointId, windowStart, windowEnd };
        const route = { ...current.route, passengers: passengers.toSpliced(position, 0, stop) };
        const rider = { request: first, walkMinutes: Math.round(point.walkMinutes) };
        const both = withRider(car(route, current.riders.toSpliced(position, 0, rider)), second);
        if (both) yield both;
      }
    }
  }

  // Null when the others no longer fit without them, say because the car now arrives
  // before someone's window opens.
  function withoutRider(current: Car, request: DayRequest): Car | null {
    const stop = current.riders.findIndex((rider) => rider?.request === request);
    const route = { ...current.route, passengers: current.route.passengers.toSpliced(stop, 1) };
    return routeFits(route, date, model) ? car(route, current.riders.toSpliced(stop, 1)) : null;
  }

  const cars = new Map(
    instance.offers.map((offer) => [
      offer.id,
      car(
        offer,
        offer.passengers.map(() => null),
      ),
    ]),
  );
  const seatedOn = new Map<DayRequest, string>();
  const waiting = () => instance.requests.filter((request) => !seatedOn.has(request));

  // The offers a passenger tries: those going their way that take them alone, or turn
  // them down only for the time, since seating others can delay a car into their window.
  // A driver who turns them down alone for the detour could still take them once another
  // pickup takes the car their way, but that is rare, and leaving those offers out makes a
  // day of 200 needs and 60 offers about ten times faster, time the local search uses
  // better.
  const reachable = new Map(
    instance.requests.map((request) => [
      request,
      instance.offers.filter((offer) => {
        if (offer.direction !== request.direction) return false;
        const alone = bestInsertion(offer, request, model, date);
        return alone.feasible || alone.reason === "outside_time_window";
      }),
    ]),
  );
  const canJoin = (request: DayRequest, offerId: string) =>
    reachable.get(request)!.some((offer) => offer.id === offerId);
  const rank = (request: DayRequest) => {
    const routes = reachable.get(request)!.map((offer) => cars.get(offer.id)!.route);
    return rankOffersForRequest(request, routes, model, date).matches;
  };

  // Regret insertion: one passenger per round, until nobody waiting fits anywhere.
  const matches = new Map(instance.requests.map((request) => [request, rank(request)]));
  for (;;) {
    const candidates = waiting()
      .map((request) => ({ request, matches: matches.get(request)! }))
      .filter((candidate) => candidate.matches.length > 0);
    // Stable, so a full tie goes to whoever asked first.
    const next = candidates.toSorted(seatsFirst(priority))[0];
    if (!next) break;
    const best = next.matches[0]!;
    cars.set(best.offerId, seat(cars.get(best.offerId)!, next.request, best));
    seatedOn.set(next.request, best.offerId);
    // Only that car changed, so only those who could join it are ranked again.
    for (const request of waiting())
      if (canJoin(request, best.offerId)) matches.set(request, rank(request));
  }

  // Every plan one move away, as the cars it changes.
  function* moves(): Generator<Car[]> {
    for (const request of waiting()) {
      for (const offer of reachable.get(request)!) {
        const target = cars.get(offer.id)!;
        const joined = withRider(target, request);
        if (joined) yield [joined];
        // Make room: take someone off, and seat them elsewhere if possible.
        for (const rider of target.riders) {
          if (!rider) continue;
          const freed = withoutRider(target, rider.request);
          const replaced = freed && withRider(freed, request);
          if (!replaced) continue;
          yield [replaced];
          for (const other of reachable.get(rider.request)!) {
            if (other.id === offer.id) continue;
            const moved = withRider(cars.get(other.id)!, rider.request);
            if (moved) yield [replaced, moved];
          }
        }
      }
    }
    const left = waiting();
    for (const [index, first] of left.entries()) {
      for (const offer of reachable.get(first)!) {
        // Alone they would have been seated by now.
        if (withRider(cars.get(offer.id)!, first)) continue;
        for (const second of left.slice(index + 1)) {
          if (!canJoin(second, offer.id)) continue;
          for (const both of withPair(cars.get(offer.id)!, first, second)) yield [both];
        }
      }
    }
    for (const [request, from] of seatedOn) {
      const source = withoutRider(cars.get(from)!, request);
      if (!source) continue;
      for (const offer of reachable.get(request)!) {
        if (offer.id === from) {
          const again = withRider(source, request);
          if (again) yield [again];
          continue;
        }
        const target = cars.get(offer.id)!;
        const moved = withRider(target, request);
        if (moved) yield [source, moved];
        // Swap with someone who can take this seat.
        for (const rider of target.riders) {
          if (!rider || !canJoin(rider.request, from)) continue;
          const freed = withoutRider(target, rider.request);
          const swappedIn = freed && withRider(freed, request);
          const swappedBack = swappedIn && withRider(source, rider.request);
          if (swappedBack) yield [swappedBack, swappedIn];
        }
      }
    }
  }

  let total = [...cars.values()].reduce((sum, current) => plus(sum, current.score), nothing);
  const withChanges = (changed: readonly Car[]) =>
    changed.reduce(
      (sum, current) => plus(plus(sum, current.score), cars.get(current.route.id)!.score, -1),
      total,
    );

  // Puts the changed cars in the plan; whoever no car carries any more is waiting again.
  function apply(changed: readonly Car[]) {
    total = withChanges(changed);
    for (const current of changed) cars.set(current.route.id, current);
    seatedOn.clear();
    for (const { route, riders } of cars.values())
      for (const rider of riders) if (rider) seatedOn.set(rider.request, route.id);
  }

  // Applies the first move that improves the plan; false at a local optimum or once the
  // budget, counted from here, runs out.
  const deadline = performance.now() + timeBudgetMs;
  function improve() {
    for (const changed of moves()) {
      if (compare(withChanges(changed), total, priority) > 0) {
        apply(changed);
        return true;
      }
      if (performance.now() >= deadline) return false;
    }
    return false;
  }
  while (performance.now() < deadline) if (!improve()) break;

  // A last pass on the final routes tries every offer going each waiting passenger's way:
  // those left out of `reachable`, and whoever the budget did not reach. When it seats
  // nobody, the reasons it found are the final ones.
  const reasons = new Map<DayRequest, InfeasibleReason>();
  for (let seatedSomeone = true; seatedSomeone; ) {
    seatedSomeone = false;
    for (const request of waiting()) {
      const routes = [...cars.values()].map((current) => current.route);
      const { matches, reason } = rankOffersForRequest(request, routes, model, date);
      const best = matches[0];
      if (best) {
        apply([seat(cars.get(best.offerId)!, request, best)]);
        seatedSomeone = true;
      } else {
        // With no match there is always a reason.
        reasons.set(request, reason!);
      }
    }
  }

  const seated = new Map<DayRequest, Assignment>();
  for (const { route, riders } of cars.values()) {
    if (riders.every((rider) => rider === null)) continue;
    // Seating someone ahead of a passenger delays them, so times come from the final route.
    const timing = timeRoute(route, date, model);
    riders.forEach((rider, position) => {
      if (!rider) return;
      const { request, walkMinutes } = rider;
      const without = { ...route, passengers: route.passengers.toSpliced(position, 1) };
      const detourMinutes = Math.round(timing.minutes - timeRoute(without, date, model).minutes);
      seated.set(request, {
        requestId: request.id,
        passengerId: request.passengerId,
        offerId: route.id,
        meetingPointId: route.passengers[position]!.meetingPointId,
        position,
        ...timing.stops[position]!,
        detourMinutes,
        walkMinutes,
        avoidsCarTrip: avoidsCarTrip(request.fallbackMode),
      });
    });
  }

  return {
    // In the order the requests came.
    assignments: instance.requests.flatMap((request) => seated.get(request) ?? []),
    // Why each one is left out, on the final routes.
    unassigned: waiting().map((request) => ({
      requestId: request.id,
      passengerId: request.passengerId,
      reason: reasons.get(request)!,
    })),
    objective: total,
    metrics: { matched: byFallback([...seated.keys()]), unassigned: byFallback(waiting()) },
    durationMs: Math.round(performance.now() - start),
  };
}
