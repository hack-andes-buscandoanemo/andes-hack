"use client";

import {
  CreateTripOfferBodySchema,
  CreateVehicleBodySchema,
  type TripDirectionSchema,
} from "@andes-hack/api";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type z from "zod";

import { paymentMethodOptions } from "@/components/trip-price";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  communitiesApi,
  type MembershipSummary,
  type PaymentMethod,
  type VehicleSummary,
  type ZoneSummary,
} from "@/lib/communities-api";

type TripDirection = z.infer<typeof TripDirectionSchema>;
type ScheduleMode = "recurring" | "single";

const WEEKDAYS: Array<{ iso: number; label: string }> = [
  { iso: 1, label: "L" },
  { iso: 2, label: "M" },
  { iso: 3, label: "X" },
  { iso: 4, label: "J" },
  { iso: 5, label: "V" },
  { iso: 6, label: "S" },
  { iso: 7, label: "D" },
];

const DETOUR_OPTIONS: Array<{ value: 0 | 5 | 10; label: string }> = [
  { value: 0, label: "Sin desvío (en mi ruta)" },
  { value: 5, label: "Hasta 5 min" },
  { value: 10, label: "Hasta 10 min" },
];

const TIME_SLOTS_15M: string[] = [];
for (let h = 5; h <= 22; h += 1) {
  for (const m of [0, 15, 30, 45]) {
    TIME_SLOTS_15M.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

export default function OfferPage() {
  const router = useRouter();
  const [membership, setMembership] = useState<MembershipSummary | null>(null);
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [zones, setZones] = useState<ZoneSummary[]>([]);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("recurring");
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerSuccess, setOfferSuccess] = useState<string | null>(null);

  const vehicleForm = useForm({
    defaultValues: {
      plate: "",
      makeModel: "",
      color: "",
      seats: "3",
    },
    onSubmit: async ({ value }) => {
      setVehicleError(null);
      const parsed = CreateVehicleBodySchema.safeParse({
        plate: value.plate,
        makeModel: value.makeModel,
        color: value.color,
        seats: Number(value.seats),
      });
      if (!parsed.success) {
        setVehicleError(parsed.error.issues[0]?.message ?? "Revisa los datos de tu vehículo.");
        return;
      }
      try {
        const created = await communitiesApi.createVehicle(parsed.data);
        setVehicles((prev) => [...prev, created]);
        offerForm.setFieldValue("vehicleId", created.id);
        offerForm.setFieldValue("seatsTotal", String(created.seats));
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 409) {
          setVehicleError("Esta placa ya está registrada.");
        } else {
          setVehicleError("No pudimos registrar tu vehículo.");
        }
      }
    },
  });

  const offerForm = useForm({
    defaultValues: {
      vehicleId: "",
      direction: "outbound" as TripDirection,
      originZoneId: "",
      departureTime: "07:30",
      daysOfWeek: [] as number[],
      date: "",
      seatsTotal: "3",
      maxDetourMinutes: 5 as 0 | 5 | 10,
      womenOnly: false,
      note: "",
      price: "",
      paymentMethods: [] as PaymentMethod[],
    },
    onSubmit: async ({ value }) => {
      if (!membership) return;
      setOfferError(null);
      setOfferSuccess(null);

      const selectedVehicle = vehicles.find((v) => v.id === value.vehicleId) ?? vehicles[0];
      const seatsNum = Number(value.seatsTotal);
      if (selectedVehicle && seatsNum > selectedVehicle.seats) {
        setOfferError("No puedes ofrecer más asientos de los que tiene tu vehículo.");
        return;
      }

      // Soles typed as "5" or "5.50"; the API takes céntimos.
      const priceSoles = Number(value.price.replace(",", "."));
      if (value.price.trim() && (!Number.isFinite(priceSoles) || priceSoles < 0)) {
        setOfferError("Ingresa un precio válido, por ejemplo 5 o 5.50.");
        return;
      }

      const payload = {
        vehicleId: value.vehicleId || selectedVehicle?.id || "",
        direction: value.direction,
        originZoneId: value.originZoneId || zones[0]?.id || "",
        departureTime: value.departureTime,
        daysOfWeek: scheduleMode === "recurring" ? value.daysOfWeek : null,
        date: scheduleMode === "single" ? value.date : null,
        seatsTotal: seatsNum,
        maxDetourMinutes: value.maxDetourMinutes,
        womenOnly: membership.identifiesAsWoman ? value.womenOnly : false,
        note: value.note.trim() || null,
        priceCents: value.price.trim() ? Math.round(priceSoles * 100) : null,
        paymentMethods: value.price.trim() ? value.paymentMethods : [],
      };

      const parsed = CreateTripOfferBodySchema.safeParse(payload);
      if (!parsed.success) {
        setOfferError(parsed.error.issues[0]?.message ?? "Revisa los datos de tu viaje.");
        return;
      }

      try {
        const result = await communitiesApi.createCommunityOffer(
          membership.communityId,
          parsed.data,
        );
        setOfferSuccess(result.message);
        router.push("/viajes");
      } catch (err: unknown) {
        const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error;
        setOfferError(apiError ?? "No pudimos publicar tu viaje.");
      }
    },
  });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const me = await communitiesApi.getMe();
        if (!active) return;
        const firstMembership = me.memberships[0];
        if (!firstMembership) {
          router.replace("/ingresar");
          return;
        }
        if (!firstMembership.consentAt || !firstMembership.usualMode) {
          router.replace("/comenzar");
          return;
        }
        setMembership(firstMembership);

        const [loadedVehicles, loadedZones] = await Promise.all([
          communitiesApi.listVehicles(),
          communitiesApi.listCommunityZones(firstMembership.communityId),
        ]);
        if (!active) return;
        setVehicles(loadedVehicles);
        setZones(loadedZones);
        if (loadedVehicles[0]) {
          offerForm.setFieldValue("vehicleId", loadedVehicles[0].id);
          offerForm.setFieldValue("seatsTotal", String(loadedVehicles[0].seats));
        }
        if (loadedZones[0]) {
          offerForm.setFieldValue("originZoneId", loadedZones[0].id);
        }
      } catch {
        if (!active) return;
        router.replace("/");
      }
    }
    load();
    return () => {
      active = false;
    };
    // Initial data load runs once per mount
  }, []);

  if (!membership) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-10 text-center">
        <h1 className="text-3xl font-extrabold">Ofrecer viaje</h1>
      </main>
    );
  }

  const activeVehicle = vehicles[0] ?? null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-extrabold">Ofrecer viaje</h1>

      {!activeVehicle ? (
        <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
          <h2 className="text-xl font-bold">Tu vehículo</h2>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              vehicleForm.handleSubmit();
            }}
            className="flex flex-col gap-3"
          >
            <vehicleForm.Field name="plate">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="vehicle-plate">Placa</Label>
                  <Input
                    id="vehicle-plate"
                    placeholder="ABC-123"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </vehicleForm.Field>

            <vehicleForm.Field name="makeModel">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="vehicle-make-model">Marca y modelo</Label>
                  <Input
                    id="vehicle-make-model"
                    placeholder="Toyota Corolla"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </vehicleForm.Field>

            <vehicleForm.Field name="color">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="vehicle-color">Color</Label>
                  <Input
                    id="vehicle-color"
                    placeholder="Gris"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </vehicleForm.Field>

            <vehicleForm.Field name="seats">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="vehicle-seats">Asientos disponibles para compartir</Label>
                  <Input
                    id="vehicle-seats"
                    type="number"
                    min={1}
                    max={6}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </vehicleForm.Field>

            {vehicleError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {vehicleError}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full">
              Guardar vehículo
            </Button>
          </form>
        </section>
      ) : (
        <div className="rounded-xl border bg-muted/40 p-3 text-sm font-medium">
          {`${activeVehicle.make} ${activeVehicle.model} · ${activeVehicle.plate} (${activeVehicle.color})`}
        </div>
      )}

      {activeVehicle && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            offerForm.handleSubmit();
          }}
          className="flex flex-col gap-5"
        >
          <offerForm.Field name="direction">
            {(field) => (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold">Sentido</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={field.state.value === "outbound"}
                    onClick={() => field.handleChange("outbound")}
                    className={`rounded-xl border p-3 text-left text-xs font-medium ${
                      field.state.value === "outbound"
                        ? "border-foreground bg-brand-yellow/20 font-bold"
                        : "bg-card"
                    }`}
                  >
                    {`Hacia ${membership.destinationName}`}
                  </button>
                  <button
                    type="button"
                    aria-pressed={field.state.value === "return"}
                    onClick={() => field.handleChange("return")}
                    className={`rounded-xl border p-3 text-left text-xs font-medium ${
                      field.state.value === "return"
                        ? "border-foreground bg-brand-yellow/20 font-bold"
                        : "bg-card"
                    }`}
                  >
                    {`De regreso desde ${membership.destinationName}`}
                  </button>
                </div>
              </div>
            )}
          </offerForm.Field>

          <offerForm.Subscribe selector={(state) => state.values.direction}>
            {(direction) => (
              <offerForm.Field name="originZoneId">
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="origin-zone">
                      {direction === "return" ? "Zona de llegada" : "Zona de salida"}
                    </Label>
                    <select
                      id="origin-zone"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                    >
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </offerForm.Field>
            )}
          </offerForm.Subscribe>

          <offerForm.Field name="departureTime">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="departure-time">Hora de salida</Label>
                <select
                  id="departure-time"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                >
                  {TIME_SLOTS_15M.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </offerForm.Field>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Cuándo</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={scheduleMode === "recurring" ? "default" : "outline"}
                size="sm"
                onClick={() => setScheduleMode("recurring")}
              >
                Días habituales
              </Button>
              <Button
                type="button"
                variant={scheduleMode === "single" ? "default" : "outline"}
                size="sm"
                onClick={() => setScheduleMode("single")}
              >
                Un solo día
              </Button>
            </div>

            {scheduleMode === "recurring" ? (
              <offerForm.Field name="daysOfWeek">
                {(field) => (
                  <div className="flex gap-1.5 pt-1">
                    {WEEKDAYS.map((day) => {
                      const active = field.state.value.includes(day.iso);
                      return (
                        <button
                          key={day.iso}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            const next = active
                              ? field.state.value.filter((d) => d !== day.iso)
                              : [...field.state.value, day.iso].sort((a, b) => a - b);
                            field.handleChange(next);
                          }}
                          className={`flex size-10 items-center justify-center rounded-full border text-sm font-bold ${
                            active
                              ? "border-foreground bg-brand-yellow text-brand-black"
                              : "bg-card"
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </offerForm.Field>
            ) : (
              <offerForm.Field name="date">
                {(field) => (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <Label htmlFor="offer-date">Fecha del viaje</Label>
                    <Input
                      id="offer-date"
                      type="date"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </offerForm.Field>
            )}
          </div>

          <offerForm.Field name="seatsTotal">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offer-seats">Asientos para este viaje</Label>
                <Input
                  id="offer-seats"
                  type="number"
                  min={1}
                  max={activeVehicle.seats}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </offerForm.Field>

          <offerForm.Field name="maxDetourMinutes">
            {(field) => (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold">Desvío máximo</span>
                <div className="flex flex-col gap-1.5">
                  {DETOUR_OPTIONS.map((opt) => {
                    const selected = field.state.value === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => field.handleChange(opt.value)}
                        className={`rounded-xl border p-2.5 text-left text-sm font-medium ${
                          selected ? "border-foreground bg-brand-yellow/20 font-bold" : "bg-card"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </offerForm.Field>

          {membership.identifiesAsWoman && (
            <offerForm.Field name="womenOnly">
              {(field) => (
                <div className="flex items-center gap-2">
                  <input
                    id="women-only"
                    type="checkbox"
                    checked={field.state.value}
                    onChange={(e) => field.handleChange(e.target.checked)}
                    className="size-4 accent-foreground"
                  />
                  <Label htmlFor="women-only">Solo con pasajeras mujeres</Label>
                </div>
              )}
            </offerForm.Field>
          )}

          <offerForm.Field name="price">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offer-price">Precio por asiento (S/, opcional)</Label>
                <Input
                  id="offer-price"
                  inputMode="decimal"
                  placeholder="5.00"
                  maxLength={6}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Los pasajeros lo ven antes de pedir el asiento. Te Jalo no cobra: se paga contigo.
                </p>
              </div>
            )}
          </offerForm.Field>

          <offerForm.Subscribe selector={(state) => state.values.price.trim() !== ""}>
            {(hasPrice) =>
              hasPrice ? (
                <offerForm.Field name="paymentMethods">
                  {(field) => (
                    <fieldset className="flex flex-col gap-2">
                      <legend className="text-sm font-semibold">Cómo te pagan</legend>
                      <div className="flex gap-2">
                        {paymentMethodOptions.map((option) => {
                          const active = field.state.value.includes(option.value);
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                field.handleChange(
                                  active
                                    ? field.state.value.filter((method) => method !== option.value)
                                    : [...field.state.value, option.value],
                                )
                              }
                              className={`rounded-xl border px-4 py-2 text-sm font-medium ${
                                active
                                  ? "border-foreground bg-brand-yellow/20 font-bold"
                                  : "bg-card"
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  )}
                </offerForm.Field>
              ) : null
            }
          </offerForm.Subscribe>

          <offerForm.Field name="note">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offer-note">Nota opcional</Label>
                <Input
                  id="offer-note"
                  placeholder="Paso por Javier Prado"
                  maxLength={280}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </offerForm.Field>

          {offerError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {offerError}
            </p>
          )}

          {offerSuccess && (
            <p role="status" className="text-sm font-medium text-foreground">
              {offerSuccess}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full">
            Publicar viaje
          </Button>
        </form>
      )}
    </main>
  );
}
