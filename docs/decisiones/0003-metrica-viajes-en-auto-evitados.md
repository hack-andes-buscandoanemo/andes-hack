# La métrica de impacto son los viajes en auto evitados, no las personas transportadas

Contar personas transportadas exagera el impacto: en Lima la mayoría de pasajeros llega en transporte público, y llevarla en auto no saca ningún auto de la calle. Solo el 7 % de las personas va a trabajar principalmente en su propio auto (Encuesta Lima Cómo Vamos 2024, en `/datos`). Por eso la cifra principal de Te Jalo son los **viajes en auto evitados**, que `packages/matching/src/metrics.ts` calcula aparte de las personas.

## Cómo se cuenta

- Cada búsqueda pregunta "Si no encuentras viaje, ¿cómo irías?". Un asiento evita un viaje en auto solo si la respuesta es manejar solo o tomar un taxi o una app.
- Un conductor que antes no hacía ese trayecto en auto **induce** un viaje en auto. La cifra neta resta esos viajes inducidos. Si el modo habitual del conductor no se conoce (porque borró su cuenta), cuenta como inducido.
- Hay dos niveles: **potencial** (asientos aceptados) y **verificado** (viajes completados). Los km y el CO₂ evitados son estimados y descuentan los km de desvío para recoger a cada pasajero.
- Las cuentas del equipo no cuentan, ni como conductor ni como pasajero.

## Consecuencias

- El optimizador (US-017) maximiza primero los viajes en auto evitados y después los pasajeros sentados. Esto puede dejar sin asiento a alguien que hoy va en bus y busca seguridad, así que también existe la prioridad `passengers`.
- Quien venía en transporte público se muestra aparte (`fromPublicTransport`): para esa persona es un beneficio de seguridad y tiempo, aunque no reduzca el tráfico.
