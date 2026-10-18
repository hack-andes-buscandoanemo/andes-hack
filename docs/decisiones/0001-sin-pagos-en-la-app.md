# Sin pagos en la app

Te Jalo no cobra, no procesa pagos y no muestra tarifas. El RNAT (D.S. 017-2009-MTC, art. 3, num. 3.61) define el transporte privado como el traslado de personas sin ninguna contraprestación y no hace excepción por compartir gastos. Cobrar por un asiento, aunque sea "solo la gasolina", podría convertir al conductor en un transportista que necesita una autorización.

Por eso la app solo muestra un **estimado de combustible** del trayecto y cuánto sería por ocupante (US-034, `packages/matching/src/fuel-cost.ts`). Es una referencia para que los ocupantes conversen un aporte voluntario fuera de la app, nunca un precio.

## Consecuencias

- No hay pasarela de pagos, ni comisiones, ni dinero entre colegas dentro de la app. Así el modelo de negocio no depende de cobrar por viaje: quien paga es la institución (RR. HH., bienestar o facilities).
- Compartir gastos dentro de la app solo se evaluaría con una opinión de la ATU o del MTC que lo permita expresamente.
