"use client";

import {
  CreateTripOfferBodySchema,
  CreateVehicleBodySchema,
  type VoiceOfferResponse,
  type VoiceVehicleResponse,
} from "@andes-hack/api";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import CommunityContext from "@/components/community-context";
import PlacePicker from "@/components/place-picker";
import RouteMap from "@/components/route-map";
import StandaloneHeader from "@/components/standalone-header";
import { paymentMethodOptions, soles } from "@/components/trip-price";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import VoiceFab from "@/components/voice-fab";
import {
  communitiesApi,
  type MembershipSummary,
  type PaymentMethod,
  type VehicleSummary,
} from "@/lib/communities-api";
import { currentPlace, findPlaces, type Place } from "@/lib/geo";
import { dictateOffer, dictateVehicle } from "@/lib/voice-api";

import { limaToday, WEEKDAYS as WEEKDAY_NAMES } from "@/app/(app)/buscar/schedule";

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
  // The cars arrive after the rest of the page: until then there is no form to dictate.
  const [vehiclesLoaded, setVehiclesLoaded] = useState(false);
  // Where the trip starts and where it ends, chosen on the map; the street route between
  // them is drawn when the trip is published.
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
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

      if (!origin || !destination) {
        setOfferError("Elige dónde sales y a dónde vas.");
        return;
      }

      const payload = {
        vehicleId: value.vehicleId || selectedVehicle?.id || "",
        origin,
        destination,
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

        const loadedVehicles = await communitiesApi.listVehicles();
        if (!active) return;
        setVehicles(loadedVehicles);
        setVehiclesLoaded(true);
        if (loadedVehicles[0]) {
          offerForm.setFieldValue("vehicleId", loadedVehicles[0].id);
          offerForm.setFieldValue("seatsTotal", String(loadedVehicles[0].seats));
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
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Ofrecer viaje</h1>
      </main>
    );
  }

  const activeVehicle = vehicles[0] ?? null;

  // Fills the car registration with what the driver dictated; what was not said stays empty.
  function applyVoiceVehicle({ fields }: VoiceVehicleResponse): string[] {
    const notes: string[] = [];
    if (fields.plate) {
      const plate = fields.plate.toUpperCase().replace(/\s+/g, "");
      vehicleForm.setFieldValue("plate", plate);
      notes.push(`Placa: ${plate}`);
    }
    if (fields.makeModel) {
      vehicleForm.setFieldValue("makeModel", fields.makeModel);
      notes.push(`Marca y modelo: ${fields.makeModel}`);
    }
    if (fields.color) {
      vehicleForm.setFieldValue("color", fields.color);
      notes.push(`Color: ${fields.color}`);
    }
    if (fields.seats !== null) {
      vehicleForm.setFieldValue("seats", String(fields.seats));
      notes.push(`Asientos: ${fields.seats}`);
    }
    setVehicleError(null);
    if (notes.length === 0) notes.push("No detecté datos del auto en lo que dijiste.");
    return notes;
  }

  // The departure times the form offers are every 15 minutes: what was said snaps to the nearest.
  function snapToSlot(clock: string) {
    const [hours = 0, minutes = 0] = clock.split(":").map(Number);
    const total = Math.round((hours * 60 + minutes) / 15) * 15;
    const clamped = Math.min(22 * 60 + 45, Math.max(5 * 60, total));
    return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
  }

  // Fills the form with what the driver dictated and says what it did, one line each. Places
  // are looked up on the map; what was not said stays as it was.
  async function applyVoice({ fields }: VoiceOfferResponse): Promise<string[]> {
    const notes: string[] = [];

    if (fields.departureTime) {
      const slot = snapToSlot(fields.departureTime);
      offerForm.setFieldValue("departureTime", slot);
      notes.push(`Hora de salida: ${slot}`);
    }

    if (
      fields.when === "single" ||
      (fields.when === null && fields.days.length === 0 && fields.date)
    ) {
      if (fields.date && fields.date >= limaToday()) {
        setScheduleMode("single");
        offerForm.setFieldValue("date", fields.date);
        notes.push(`Un solo día: ${fields.date}`);
      }
    } else if (fields.when === "recurring" || fields.days.length > 0) {
      const days = fields.days.length > 0 ? [...new Set(fields.days)].toSorted() : [1, 2, 3, 4, 5];
      setScheduleMode("recurring");
      offerForm.setFieldValue("daysOfWeek", days);
      notes.push(
        `Días: ${days.map((iso) => WEEKDAY_NAMES.find((day) => day.iso === iso)?.name ?? iso).join(", ")}`,
      );
    }

    if (fields.seatsTotal !== null && activeVehicle) {
      const seats = Math.min(fields.seatsTotal, activeVehicle.seats);
      offerForm.setFieldValue("seatsTotal", String(seats));
      notes.push(
        seats < fields.seatsTotal
          ? `Asientos: ${seats} (tu auto solo tiene ${activeVehicle.seats})`
          : `Asientos: ${seats}`,
      );
    }
    if (fields.priceSoles !== null) {
      offerForm.setFieldValue("price", String(fields.priceSoles));
      notes.push(`Precio: ${soles(Math.round(fields.priceSoles * 100))} por asiento`);
      if (fields.paymentMethods.length > 0) {
        offerForm.setFieldValue("paymentMethods", fields.paymentMethods);
        notes.push(
          `Pago: ${fields.paymentMethods.map((method) => (method === "yape" ? "Yape" : "Efectivo")).join(" y ")}`,
        );
      } else if (fields.priceSoles > 0) {
        notes.push("Falta decir cómo te pagan: Yape o efectivo");
      }
    }
    if (fields.womenOnly !== null && membership?.identifiesAsWoman) {
      offerForm.setFieldValue("womenOnly", fields.womenOnly);
      notes.push(`Solo pasajeras mujeres: ${fields.womenOnly ? "sí" : "no"}`);
    }
    if (fields.maxDetourMinutes !== null) {
      offerForm.setFieldValue("maxDetourMinutes", fields.maxDetourMinutes);
      notes.push(
        fields.maxDetourMinutes === 0
          ? "Sin desvío"
          : `Desvío de hasta ${fields.maxDetourMinutes} min`,
      );
    }
    if (fields.note) {
      offerForm.setFieldValue("note", fields.note.slice(0, 280));
      notes.push(`Nota: ${fields.note}`);
    }

    // The two places, looked up at once: neither waits for the other.
    const lookup = (text: string | null) =>
      text
        ? findPlaces(text, 1)
            .then(([place]) => ({ place: place ?? null, said: text }))
            .catch(() => ({ place: null, said: text }))
        : null;
    const [from, to] = await Promise.all([
      fields.originIsCurrentLocation
        ? currentPlace().then((place) => ({ place, said: "tu ubicación" }))
        : lookup(fields.origin),
      lookup(fields.destination),
    ]);
    if (from) {
      if (from.place) {
        setOrigin(from.place);
        notes.push(`Sales de: ${from.place.label}`);
      } else notes.push(`No encontré “${from.said}”: escribe de dónde sales`);
    }
    if (to) {
      if (to.place) {
        setDestination(to.place);
        notes.push(`Vas a: ${to.place.label}`);
      } else notes.push(`No encontré “${to.said}”: escribe a dónde vas`);
    }
    if (notes.length === 0) notes.push("No detecté campos del formulario en lo que dijiste.");
    setOfferError(null);
    return notes;
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-5 pb-10 md:max-w-xl">
      <StandaloneHeader />
      <div className="space-y-3">
        <Link
          href="/inicio"
          className="-ml-1 inline-flex min-h-9 items-center gap-1 rounded-lg px-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" aria-hidden />
          Volver al inicio
        </Link>
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Ofrecer viaje</h1>
      </div>
      <CommunityContext
        communityName={membership.communityName}
        destinationName={membership.destinationName}
      />
      {vehiclesLoaded && !activeVehicle ? (
        <VoiceFab
          hint="“Mi placa es A B C, 1 2 3, un Toyota Corolla blanco con cuatro asientos”"
          process={async (audio) => {
            const result = await dictateVehicle(audio);
            return { heard: result.text, notes: applyVoiceVehicle(result) };
          }}
        />
      ) : null}
      {activeVehicle ? (
        <VoiceFab
          hint="“Salgo de La Molina a la sede a las siete, de lunes a viernes, tres asientos, cinco soles por Yape”"
          process={async (audio) => {
            const result = await dictateOffer(audio, membership.destinationName);
            return { heard: result.text, notes: await applyVoice(result) };
          }}
        />
      ) : null}

      {!activeVehicle ? (
        <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">Tu vehículo</h2>
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
        <div className="rounded-xl border bg-muted px-4 py-3 text-sm font-medium">
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
          <PlacePicker
            id="trip-origin"
            label="Sales de"
            value={origin}
            onChange={setOrigin}
            withLocation
          />
          <PlacePicker
            id="trip-destination"
            label="Vas a"
            value={destination}
            onChange={setDestination}
          />
          {origin && destination ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                Así lo verán: dibujamos las calles de tu ruta al publicar.
              </p>
              <RouteMap
                route={{
                  path: [
                    [origin.lat, origin.lng],
                    [destination.lat, destination.lng],
                  ],
                  approximate: true,
                  markers: [
                    {
                      role: "start",
                      name: origin.label,
                      lat: origin.lat,
                      lng: origin.lng,
                      mine: false,
                    },
                    {
                      role: "end",
                      name: destination.label,
                      lat: destination.lat,
                      lng: destination.lng,
                      mine: false,
                    },
                  ],
                }}
              />
            </div>
          ) : null}

          <offerForm.Field name="departureTime">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="departure-time">Hora de salida</Label>
                <select
                  id="departure-time"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="field"
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
            <span className="text-sm font-medium">Cuándo</span>
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
                          className={`flex size-11 items-center justify-center rounded-full border text-sm font-semibold shadow-xs transition-colors ${
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
                <span className="text-sm font-medium">Desvío máximo</span>
                <div className="flex flex-col gap-1.5">
                  {DETOUR_OPTIONS.map((opt) => {
                    const selected = field.state.value === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => field.handleChange(opt.value)}
                        className={`flex min-h-12 items-center rounded-xl border px-4 text-left text-sm font-medium shadow-xs transition-colors ${
                          selected ? "border-foreground bg-highlight font-semibold" : "bg-card"
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
                      <legend className="text-sm font-medium">Cómo te pagan</legend>
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
                              className={`min-h-11 rounded-xl border px-5 text-sm font-medium shadow-xs transition-colors ${
                                active ? "border-foreground bg-highlight font-semibold" : "bg-card"
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
