import type { components } from "@/lib/api-schema";

import SourceInfo from "./source-info";

type FuelEstimate = components["schemas"]["FuelEstimate"];

// Lima writes soles as "S/ 9,84".
const soles = new Intl.NumberFormat("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const solesLabel = (amount: number) => `S/ ${soles.format(amount)}`;

export const FUEL_UNKNOWN = "No pudimos estimar el combustible de este tramo.";
export const FUEL_NOTE =
  "Referencial. Te Jalo no cobra ni procesa pagos: el precio base lo fija quien maneja y se paga directamente con Yape o efectivo.";

// The fuel of the leg on the trip detail and in "Viajes" (US-034): a figure to talk about
// a voluntary contribution. There is no fare, balance or payment anywhere in the app.
export function FuelEstimateDetail({ estimate }: { estimate: FuelEstimate }) {
  return (
    <section
      aria-labelledby="fuel-estimate"
      className="space-y-1 rounded-2xl border bg-card p-4 text-sm shadow-sm"
    >
      <h2 id="fuel-estimate" className="font-bold">
        Combustible estimado
      </h2>
      {estimate ? (
        <>
          <p>
            {`Combustible estimado del tramo: ${solesLabel(estimate.tripSoles)}`}
            <SourceInfo topic="impacto" />
          </p>
          <p className="font-semibold">
            {`Por ocupante (incluido el conductor): ${solesLabel(estimate.perOccupantSoles)}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {`Calculado para ${estimate.occupants} ocupantes.`}
          </p>
        </>
      ) : (
        <p>{FUEL_UNKNOWN}</p>
      )}
      <p className="text-xs text-muted-foreground">{FUEL_NOTE}</p>
    </section>
  );
}

// The one-line version for cards and lists (Inicio, Buscar and Viajes).
export function FuelShareLine({ estimate }: { estimate: FuelEstimate }) {
  if (!estimate) return <p className="text-xs text-muted-foreground">{FUEL_UNKNOWN}</p>;
  return (
    <p className="text-sm">
      {`Aporte de combustible estimado: ${solesLabel(estimate.perOccupantSoles)} por persona`}
      <SourceInfo topic="impacto" />
    </p>
  );
}
