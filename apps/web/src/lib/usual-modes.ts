import type { UsualModeSchema } from "@andes-hack/api";
import type z from "zod";

export type UsualMode = z.infer<typeof UsualModeSchema>;

// "¿Cómo viajaste la última vez?": asked at onboarding and editable from the profile.
export const USUAL_MODE_OPTIONS: Array<{ value: UsualMode; label: string }> = [
  { value: "drove_alone", label: "En mi auto, solo/a" },
  { value: "drove_with_others", label: "En mi auto, con otras personas" },
  { value: "car_passenger", label: "En auto de alguien conocido" },
  {
    value: "public_transport",
    label: "En transporte público (bus, corredor, tren, Metropolitano, colectivo)",
  },
  { value: "taxi_app", label: "En taxi o app (Uber, Cabify, InDrive, etc.)" },
  { value: "other", label: "En bici, caminando u otro" },
];
