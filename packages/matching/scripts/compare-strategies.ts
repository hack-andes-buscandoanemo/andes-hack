// Runs both strategies over random days of one community on the real places of Lima
// and prints what the optimizer adds over first come, first served. Synthetic days with a
// fixed seed, not the demo community: it only has real members and none of their trips
// are made up. `bun run compare:strategies`.

import {
  compareStrategies,
  createTravelTimeModel,
  type StrategyComparison,
  type StrategyReport,
} from "../src/index";
import { randomDay } from "../src/testing/random-day";

const days = Number(process.argv[2] ?? 200);
if (!Number.isInteger(days) || days < 1) throw new Error("Pasa un número de días mayor que 0.");
const size = { offers: 12, requests: 30 };
const model = createTravelTimeModel();

type Strategy = keyof StrategyComparison;
type Figure = keyof Omit<StrategyReport, "plan">;
const strategies: readonly Strategy[] = ["firstComeFirstServed", "optimizer"];

const totals: Record<Strategy, Record<Figure, number>> = {
  firstComeFirstServed: zero(),
  optimizer: zero(),
};
let optimizerAhead = 0;
let firstComeAhead = 0;

for (let seed = 1; seed <= days; seed++) {
  const comparison = compareStrategies(randomDay(seed, size, model), model);
  for (const strategy of strategies) {
    const report = comparison[strategy];
    for (const key of Object.keys(totals[strategy]) as Figure[]) {
      totals[strategy][key] += report[key];
    }
  }
  const difference =
    comparison.optimizer.carTripsAvoided - comparison.firstComeFirstServed.carTripsAvoided;
  if (difference > 0) optimizerAhead++;
  if (difference < 0) firstComeAhead++;
}

function zero() {
  return {
    carTripsAvoided: 0,
    passengersMatched: 0,
    coverage: 0,
    detourMinutes: 0,
    averageDetourMinutes: 0,
    averageWalkMinutes: 0,
    durationMs: 0,
  };
}

const perDay = (strategy: Strategy, key: Figure) => (totals[strategy][key] / days).toFixed(2);

console.log(
  `${days} días aleatorios, ${size.offers} ofertas y ${size.requests} necesidades cada uno`,
);
console.log("");
console.log("| Por día | Primero en llegar | Optimizador |");
console.log("| :-- | --: | --: |");
for (const [label, key] of [
  ["Viajes en auto evitados", "carTripsAvoided"],
  ["Pasajeros emparejados", "passengersMatched"],
  ["Cobertura", "coverage"],
  ["Desvío total (min)", "detourMinutes"],
  ["Desvío promedio por pasajero (min)", "averageDetourMinutes"],
  ["Caminata promedio (min)", "averageWalkMinutes"],
  ["Tiempo de cálculo (ms)", "durationMs"],
] as const) {
  console.log(
    `| ${label} | ${perDay("firstComeFirstServed", key)} | ${perDay("optimizer", key)} |`,
  );
}
console.log("");
console.log(
  `Días en que el optimizador evita más viajes en auto: ${optimizerAhead}; menos: ${firstComeAhead}; igual: ${days - optimizerAhead - firstComeAhead}`,
);
