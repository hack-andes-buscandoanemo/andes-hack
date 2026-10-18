# Motor de emparejamiento en un paquete TypeScript puro

El emparejamiento (tiempos en hora punta, punto de encuentro y desvío, asignación de los asientos de una jornada) vive en `packages/matching`: TypeScript sin dependencias de ejecución, sin acceso a la base de datos y sin red. La API (`apps/server`, un Worker de Cloudflare) le pasa los datos de la jornada y guarda el plan que devuelve.

## Opciones consideradas

- **OR-Tools en Python (descartada).** Resuelve problemas de ruteo con capacidad y ventanas horarias de forma más general, pero exige un segundo servicio en otro lenguaje, desplegarlo aparte, mantener un contrato entre ambos y probarlo con otra herramienta.
- **TypeScript puro (elegida).** Corre dentro del mismo Worker, comparte tipos con la API y se prueba con Vitest como el resto del monorepo.

## Consecuencias

- Escribimos nosotros la heurística: inserción por arrepentimiento (_regret insertion_) y luego una búsqueda local que mueve pasajeros entre autos mientras el objetivo mejora (`packages/matching/src/optimizer.ts`). No hay pasos aleatorios: si la búsqueda termina dentro de su tope de tiempo, la misma jornada da el mismo plan.
- Al no ser un solver exacto, lo comparamos contra el óptimo: `packages/matching/scripts/exhaustive-optima.ts` prueba todas las asignaciones de 200 jornadas pequeñas y `packages/matching/src/optimizer-optimality.test.ts` exige que el optimizador nunca supere ese óptimo y lo alcance en al menos el 95 % de las jornadas.
- El tiempo de la búsqueda local tiene un tope (`timeBudgetMs`); al vencer, se devuelve el mejor plan encontrado hasta entonces, que puede variar con la velocidad de la máquina.
- La corrida de emparejamiento de la API (`apps/server/src/match-runs.ts`) llama a `compareStrategies`, que corre el optimizador y la estrategia "primero en llegar" (US-018) sobre la misma jornada. Si la escala lo pidiera, un solver externo podría reemplazar al optimizador detrás de esa misma función.
