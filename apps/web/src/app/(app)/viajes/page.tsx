import { Suspense } from "react";

import Viajes from "./viajes";

// useSearchParams (the `?tab=historial` link from Perfil) needs a Suspense boundary to build.
export default function TripsPage() {
  return (
    <Suspense>
      <Viajes />
    </Suspense>
  );
}
