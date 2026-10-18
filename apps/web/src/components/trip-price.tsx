import type { PaymentMethod } from "@/lib/communities-api";

const methodLabels: Record<PaymentMethod, string> = { yape: "Yape", cash: "Efectivo" };

export const paymentMethodOptions: { value: PaymentMethod; label: string }[] = [
  { value: "yape", label: methodLabels.yape },
  { value: "cash", label: methodLabels.cash },
];

export function soles(cents: number) {
  return `S/ ${(cents / 100).toFixed(2)}`;
}

// The price per seat the driver asks, and how it is paid: a figure to agree on, since
// Te Jalo does not process the payment.
export function TripPrice({
  priceCents,
  paymentMethods,
}: {
  priceCents: number | null;
  paymentMethods: PaymentMethod[];
}) {
  if (!priceCents) {
    return <p className="text-sm font-medium">Sin precio fijado: lo acuerdan entre ustedes.</p>;
  }
  return (
    <p className="text-sm">
      <span className="font-extrabold">{`${soles(priceCents)} por asiento`}</span>
      {paymentMethods.length > 0
        ? ` · se paga con ${paymentMethods.map((method) => methodLabels[method]).join(" o ")}`
        : ""}
    </p>
  );
}

// The badge of a trip whose driver is sharing the car right now.
export function LiveBadge() {
  return (
    <span className="w-fit rounded-full bg-brand-yellow px-2.5 py-0.5 text-xs font-bold text-brand-black">
      ● En vivo
    </span>
  );
}
