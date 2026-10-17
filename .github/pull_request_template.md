## Summary

<!-- Incluye un diagrama Mermaid, árbol de llamadas, árbol de componentes o diff-sketch (ver .agents/skills/pr/SKILL.md) -->

## 🥞 Contexto de Stacked PR (Opcional)

<!-- Si este PR forma parte de una pila (Stack), indica el orden. Ej:
- [ ] #1 `feat(db): [1/3] schema`
- [x] **#2 `feat(api): [2/3] endpoints` (Este PR)**
- [ ] #3 `feat(web): [3/3] UI`
-->

## Evidence (Strict TDD — Seams & Vertical Slices)

- **Seams probados:** <!-- Fronteras públicas probadas en este PR -->
- **Before (RED):** <!-- Salida del test fallando o estado previo -->
- **After (GREEN):** <!-- Salida de bun test pasando o captura visual -->

## ⚖️ Decisiones Técnicas y Tradeoffs (Rúbrica: Claridad 10% · Complejidad 30%)

- **Decisión tomada:**
- **Alternativa descartada / Tradeoff:**

## Merge Danger

**Door:** <!-- Two-way (fácil rollback) o One-way (migración destructiva / cambio irreversible) -->

**Blast Radius:** <!-- Bajo / Medio / Alto + breve descripción del alcance -->

## ✅ Quality Gates

- [ ] Ciclo `Red → Green` ejecutado en _Vertical Slices_ sobre _seams_ públicos (`.agents/skills/tdd/SKILL.md`)
- [ ] `bun test` pasa al 100%
- [ ] `bun check-types` sin errores de TypeScript
- [ ] `bun check` (`oxlint` + `oxfmt`) sin advertencias ni errores
