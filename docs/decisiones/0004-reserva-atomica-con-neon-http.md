# Reserva atómica de asientos con `neon-http`, sin transacciones interactivas

La API corre en un Worker de Cloudflare y habla con Neon mediante `drizzle-orm/neon-http` (`packages/db/src/index.ts`). Con este driver cada consulta es una petición HTTP, y `db.transaction` lanza "No transactions support in neon-http driver". Aun así, un auto nunca debe aceptar más pasajeros que asientos, ni siquiera cuando el conductor acepta dos solicitudes al mismo tiempo.

Aceptar una solicitud (`acceptSeatRequest` en `apps/server/src/offer-detail.ts`) es **una sola sentencia SQL** con CTE. Esa sentencia bloquea la solicitud pendiente (`FOR UPDATE`), suma el asiento solo si `seats_taken < seats_total` y marca la solicitud como aceptada solo si el asiento se reservó. Como es una sola sentencia, Postgres la ejecuta de forma atómica. Si no devuelve filas, la API responde 409 con "Esta solicitud ya no está disponible." o "Tu auto ya está lleno.". Además, la tabla `trip_offer` tiene un `CHECK` que exige `seats_taken BETWEEN 0 AND seats_total`.

## Opciones consideradas

- **Driver con WebSocket (`neon-serverless`) y `BEGIN … COMMIT`.** Daría transacciones interactivas, pero cambiaría el driver de toda la API para resolver un caso que una sola sentencia ya cubre.
- **Leer los asientos libres y luego escribir desde la API.** Dos aceptaciones simultáneas podrían ver el mismo asiento libre.

## Consecuencias

- Toda operación que deba ser atómica se escribe como una sola sentencia. El test "accepts only one request competing for the last seat" (`apps/server/src/offer-detail.test.ts`) lanza dos aceptaciones a la vez contra Postgres (PGlite) y espera un 200 y un 409.
- Para que una sola corrida de emparejamiento toque una jornada a la vez se usa otra herramienta: un candado en Upstash Redis (`apps/server/src/lib/journey-lock.ts`).
