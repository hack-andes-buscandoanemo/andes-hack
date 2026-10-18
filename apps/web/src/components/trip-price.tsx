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
    return (
      <p className="text-sm text-muted-foreground">Sin precio fijado: lo acuerdan entre ustedes.</p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      <span className="text-base font-bold text-foreground tabular-nums">{soles(priceCents)}</span>
      <span className="text-foreground"> por asiento</span>
      {paymentMethods.length > 0
        ? ` · se paga con ${paymentMethods.map((method) => methodLabels[method]).join(" o ")}`
        : ""}
    </p>
  );
}

// The badge of a trip whose driver is sharing the car right now.
export function LiveBadge() {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-destructive" />
      </span>
      En vivo
    </span>
  );
}
