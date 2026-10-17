## 📌 Resumen

<!-- Describe brevemente qué problema resuelve este PR y qué parte del flujo o arquitectura implementa. -->

## 🥞 Contexto de Stacked PR (Opcional)

<!-- Si este PR forma parte de una pila (Stack), indica el orden. Ej:
- [ ] #1 `feat(db): [1/3] schema`
- [x] **#2 `feat(api): [2/3] endpoints` (Este PR)**
- [ ] #3 `feat(web): [3/3] UI`
-->

## 🔴🟢🔵 Evidencia de Strict TDD

- [ ] **RED:** Se escribieron primero las pruebas (`*.test.ts`) cubriendo el caso de uso y bordes.
- [ ] **GREEN:** Se implementó la lógica mínima necesaria para pasar las pruebas (`bun test`).
- [ ] **REFACTOR:** Se limpió y optimizó el código manteniendo la suite en verde.

## ⚖️ Decisiones Técnicas y Tradeoffs (Rúbrica: Claridad 10% · Complejidad 30%)

<!-- Explica el porqué de las decisiones de diseño tomadas en este PR y qué alternativas se descartaron (tradeoffs). -->

- **Decisión tomada:**
- **Alternativa descartada / Tradeoff:**

## ✅ Quality Gates

- [ ] `bun test` pasa al 100%
- [ ] `bun check-types` sin errores de TypeScript
- [ ] `bun check` (`oxlint` + `oxfmt`) sin advertencias ni errores
