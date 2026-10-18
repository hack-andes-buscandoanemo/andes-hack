# andes-hack

This file provides context about the project, domain model, and technical stack for AI assistants and autonomous coding agents.

## Project Overview & Domain Context

- **Product Name**: **Te Jalo** (Repo: `andes-hack` · Organización: `hack-andes-buscandoanemo`)
- **Domain**: Smart Shared Mobility / Community & Corporate Carpooling in Lima, Peru.
- **Ecosystem**: TypeScript Monorepo (Bun + Turborepo)

### Product Description

**Te Jalo** (`andes-hack`) es una plataforma inteligente de movilidad compartida que conecta a miembros de entidades públicas y privadas aliadas con miembros verificados que tienen vehículos dentro de sus propias comunidades y que ya realizan recorridos similares.

Mediante un **sistema de emparejamiento inteligente (Smart Matching)**, la aplicación identifica coincidencias entre **rutas, horarios y destinos**, facilitando viajes compartidos seguros en su diseño, coordinados y recurrentes. Su objetivo es aprovechar los asientos disponibles en vehículos particulares, reducir los desplazamientos individuales en automóvil y contribuir a una movilidad urbana más eficiente y sostenible en Lima.

### Problem Statement & Core Drivers

1. **Inseguridad ciudadana**: Ir en servicio público genera ansiedad y tensión por temor a robos o atentados. La plataforma garantiza seguridad mediante comunidades cerradas/verificadas a un precio mucho más barato que un aplicativo de taxi (como Uber), ya que los pasajeros **comparten el gasto operativo** sin generar una ganancia comercial para el conductor.
2. **Tiempos de espera y saturación**: Evita largas esperas en paraderos o colas extensas en horas punta en sistemas saturados como los Corredores o el Tren Eléctrico, ofreciendo transporte rápido a precio accesible.
3. **Incentivo para dejar el auto en casa**: Impulsa a propietarios de vehículos a dejar ocasionalmente su auto en casa, al contar con una alternativa segura cuyo costo compartido resulta menor que el gasto individual de gasolina.
4. **Reducción del tráfico**: Si 4 personas con vehículo propio coinciden en la misma ruta y viajan juntas, se retiran **3 vehículos de circulación**. Al escalar la propuesta entre múltiples instituciones aliadas, se logra reducir el tráfico y viajar con la comodidad de un transporte privado a costo de transporte público.

### Core Domain Concepts (Guía para Agentes de IA)

Al diseñar esquemas de base de datos (`packages/db`), endpoints (`apps/server`, `packages/api`) o interfaces (`apps/web`), ten en cuenta las siguientes entidades y reglas de dominio:

- **Comunidades / Entidades Aliadas (`Organization` / `Community`)**: Universidades, empresas privadas e instituciones públicas cuyos miembros están verificados (ej. por dominio de correo institucional o validación de identidad).
- **Miembros Verificados (`Member` / `User`)**: Usuarios autenticados mediante `better-auth` pertenecientes a una entidad aliada. Pueden actuar como **Pasajeros**, **Conductores** (si registran un vehículo verificado) o alternar entre ambos roles.
- **Rutas y Horarios Recurrentes (`Route` / `Schedule`)**: Trayectos habituales con origen, destino, puntos de paso (waypoints), días de la semana, hora de salida y asientos disponibles.
- **Emparejamiento Inteligente (`TripMatch` / `MatchingEngine`)**: Algoritmo/servicio encargado de detectar compatibilidad espacial (cercanía de origen/destino/ruta) y temporal (ventana horaria) entre miembros de comunidades afines.
- **División de Costos (`CostSharing`)**: Cálculo transparente de contribución a gastos de combustible/peaje dividido entre los ocupantes (modelo colaborativo sin lucro comercial).

### 🗺️ Flujo de Navegación Recomendado — Te Jalo (Arquitectura de Pantallas E2E)

Todo desarrollo de vistas (`apps/web`) y endpoints (`apps/server`) debe respaldar este flujo oficial de 8 módulos:

1. **Bienvenida e ingreso institucional**: Acceso a una comunidad autorizada.
2. **Inicio**: Pantalla principal de la aplicación, desde donde el usuario puede buscar u ofrecer viajes.
3. **Buscar viaje (Flujo del Pasajero)**: El pasajero busca rutas compatibles según origen, destino y horario.
4. **Detalle del viaje (Flujo del Pasajero)**: El pasajero revisa la información del conductor, recorrido y asientos disponibles para **solicitar un asiento**.
5. **Ofrecer viaje (Flujo del Conductor)**: El conductor publica su recorrido habitual e indica los asientos disponibles.
6. **Gestionar solicitudes (Flujo del Conductor)**: El conductor revisa las solicitudes recibidas y **acepta pasajeros compatibles**.
7. **Chat del viaje**: Coordinación entre conductor y pasajeros para confirmar horarios, puntos de encuentro y detalles del recorrido.
8. **Perfil y seguridad**: Gestión de identidad, verificación institucional, historial de viajes y preferencias personales.
   - _Nota de navegación:_ **Perfil y seguridad** es accesible desde la navegación principal en cualquier momento, no únicamente después del chat.

```text
1. Bienvenida e ingreso institucional
                 │
                 ▼
             2. Inicio
                 │
         ┌───────┴───────┐
         ▼               ▼
      PASAJERO        CONDUCTOR
         │               │
         ▼               ▼
  3. Buscar viaje   5. Ofrecer viaje
         │               │
         ▼               ▼
  4. Detalle del    6. Gestionar
      viaje            solicitudes
         │               │
         ▼               ▼
  Solicitar asiento  Aceptar pasajeros
         │               │
         └───────┬───────┘
                 │
                 ▼
        7. Chat del viaje
                 │
                 ▼
       8. Perfil y seguridad
```

## 🏆 Rúbrica de Evaluación del Hackathon (Guía de Priorización)

**Distribución Total:** **Técnico 75%** · **Producto 25%** · _Cada criterio se puntúa de 1 a 5._

Todo agente de IA o desarrollador debe tomar decisiones de arquitectura, implementación y documentación optimizando directamente estos 5 criterios:

|  Peso   |  Categoría   | Criterio                | Descripción Oficial                           | Cómo debe actuar el Agente de IA                                                                                                                                                                                                                                                              |
| :-----: | :----------: | :---------------------- | :-------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **30%** | **Técnico**  | **Complejidad técnica** | Integraciones, datos, modelos y arquitectura. | Diseñar una arquitectura robusta en el monorepo: algoritmo de _Smart Matching_ geoespacial/temporal bien modelado, esquemas relacionales sólidos en Drizzle (`packages/db`), caché/ratelimit con Upstash Redis, contratos OpenAPI tipados de extremo a extremo y validación estricta con Zod. |
| **25%** | **Técnico**  | **Funciona**            | Flujo completo en vivo desde la URL pública.  | Priorizar flujos _End-to-End (E2E)_ completamente operativos y desplegables sin errores en producción. Nunca dejar vistas rotas, mocks incompletos en rutas críticas ni migraciones pendientes.                                                                                               |
| **20%** | **Técnico**  | **Calidad técnica**     | El jurado revisa tu repo en GitHub.           | Mantener un historial de Git impecable mediante **Strict TDD**, **PRs / Stacked PRs**, commits semánticos, cero errores de tipos (`bun check-types`) y linter limpio (`bun check`).                                                                                                           |
| **15%** | **Producto** | **Problema e impacto**  | Un usuario real de tu track.                  | Enfocar cada pantalla y flujo en resolver el dolor real del ciudadano en Lima: seguridad en comunidades verificadas, ahorro frente a taxis/gasolina, cero colas en hora punta y métrica visible de vehículos retirados de circulación.                                                        |
| **10%** | **Producto** | **Claridad**            | Explicas decisiones y tradeoffs.              | Documentar explícitamente el _porqué_ de las decisiones técnicas y los _tradeoffs_ tanto en las descripciones de los Pull Requests como en la documentación del repositorio.                                                                                                                  |

---

## ⚠️ Reglas Estrictas de Ingeniería (MANDATORY WORKFLOW)

Estas reglas son **innegociables** para cualquier agente de IA o miembro del equipo que modifique el código:

### 1. Strict TDD Basado en Seams y Vertical Slices (`.agents/skills/tdd/`)

Toda implementación debe seguir estrictamente la skill **[`tdd`](.agents/skills/tdd/SKILL.md)** ([`tests.md`](.agents/skills/tdd/tests.md) y [`mocking.md`](.agents/skills/tdd/mocking.md)):

1. **Qué es un buen test (Comportamiento sobre Implementación)**:
   - Las pruebas verifican **comportamiento observable a través de interfaces públicas**, nunca detalles internos de implementación.
   - Un buen test se lee como una especificación (describe **QUÉ** capacidad existe, no **CÓMO** está programada) y sobrevive a refactorizaciones internas sin romperse.
2. **Seams (Fronteras donde viven los tests)**:
   - Un **seam** es la frontera pública donde observas el comportamiento sin meterte dentro del módulo.
   - **Prueba únicamente en _seams_ acordados previamente:** Antes de escribir cualquier test, propón los _seams_ al usuario (_"¿Cuál es la interfaz pública y qué seams debemos probar?"_, indicando en una línea qué atrapa y qué deja fuera cada seam). No se escribe ningún test en un seam no confirmado.
   - Si el diseño de la interfaz o la profundidad del módulo está en duda, consulta la skill **[`codebase-design`](.agents/skills/codebase-design/SKILL.md)**.
3. **Reglas del bucle Red → Green (Vertical Slicing)**:
   - 🔴 **Red antes que Green:** Escribe primero **una** prueba que falle (`bun run test`) y luego **únicamente** el código mínimo para pasarla. No anticipes pruebas futuras ni agregues código especulativo.
   - 🍰 **Una rebanada vertical a la vez (_Vertical Slicing / Tracer Bullets_):** `1 seam → 1 test → 1 implementación mínima → repetir`. Cada test responde a lo aprendido en el ciclo anterior.
   - 🔍 **El Refactoring pertenece a la etapa de revisión:** No mezcles refactorización arquitectónica durante el bucle Red → Green; aplícala en la fase posterior usando la skill **[`code-review`](.agents/skills/code-review/SKILL.md)**.
4. **Anti-patrones Estrictamente Prohibidos**:
   - ❌ **Acoplamiento a la implementación (_Implementation-coupled_):** Prohibido mockear colaboradores internos, probar métodos privados, asertar conteo/orden de llamadas internas o verificar por canales laterales (ej. hacer un `SELECT` directo a la DB en lugar de consultar mediante la interfaz pública).
   - ❌ **Tests Tautológicos (_Tautological_):** Prohibido recalcular el valor esperado en el test usando la misma lógica del código de producción (`expect(add(a, b)).toBe(a + b)`). Los valores esperados deben ser literales conocidos e independientes derivados de la especificación.
   - ❌ **Rebanado Horizontal (_Horizontal Slicing_):** Prohibido escribir todos los tests en lote primero y luego toda la implementación.
   - ❌ **Mocking de módulos propios:** Solo se permite hacer mock en las **fronteras del sistema** (_system boundaries_: APIs externas, pasarelas, email, reloj/aleatoriedad) usando inyección de dependencias e interfaces estilo SDK (ver [`mocking.md`](.agents/skills/tdd/mocking.md)).

### 2. Siempre PRs o Stacked PRs usando GitHub CLI (`gh`) y Skill `pr`

**Está estrictamente prohibido hacer push directo a `main` para desarrollar features o fixes.** Todo cambio debe entrar mediante Pull Requests pequeños, atómicos y revisables usando `gh` CLI y siguiendo la estructura de la skill **[`pr`](.agents/skills/pr/SKILL.md)** (`Summary` con diagrama/diff-sketch, `Evidence` Before/After, `Decisiones y Tradeoffs` y `Merge Danger`: One-way/Two-way Door + Blast Radius).

#### Flujo Estándar de PR Individual:

```bash
# 1. Crear rama descriptiva desde main actualizado
git checkout main && git pull origin main
git checkout -b feat/matching-engine-core

# 2. Desarrollar en Vertical Slices (Red -> Green) y validar Quality Gates
bun run test && bun check-types && bun check

# 3. Commit semántico (Conventional Commits) y push de la rama
git add .
git commit -m "feat(matching): implement geospatial route compatibility scorer"
git push -u origin feat/matching-engine-core

# 4. Crear PR con GitHub CLI siguiendo .agents/skills/pr/SKILL.md
gh pr create \
  --base main \
  --head feat/matching-engine-core \
  --title "feat(matching): geospatial & schedule route compatibility engine" \
  --body "## Summary
..."
```

#### Flujo de Stacked PRs (PRs Apilados para Features Complejas):

Cuando una funcionalidad grande se divide en capas (ej. `1. Schema DB` → `2. Backend API` → `3. Frontend UI`), utiliza **Stacked PRs** apuntando cada rama a su rama padre con `--base`:

```bash
# Capa 1: Base de datos (apunta a main)
git checkout -b feat/01-trips-schema main
# ... Vertical Slices TDD + commit ...
git push -u origin feat/01-trips-schema
gh pr create --base main --head feat/01-trips-schema --title "feat(db): [1/3] add trips and routes schema" --body "..."

# Capa 2: API Backend (nace de feat/01-trips-schema y apunta a feat/01-trips-schema)
git checkout -b feat/02-trips-api feat/01-trips-schema
# ... Vertical Slices TDD + commit ...
git push -u origin feat/02-trips-api
gh pr create --base feat/01-trips-schema --head feat/02-trips-api --title "feat(api): [2/3] add trip matching endpoints" --body "..."

# Capa 3: UI Frontend (nace de feat/02-trips-api y apunta a feat/02-trips-api)
git checkout -b feat/03-trips-ui feat/02-trips-api
# ... Vertical Slices TDD + commit ...
git push -u origin feat/03-trips-ui
gh pr create --base feat/02-trips-api --head feat/03-trips-ui --title "feat(web): [3/3] add trip search and cost-sharing view" --body "..."
```

### 3. Quality Gates Obligatorios antes de abrir o fusionar un PR

Ningún PR puede abrirse ni darse por completado sin que estos 3 comandos terminen con código de salida `0`:

- `bun run test` (Suite de pruebas unitarias/integración en verde)
- `bun check-types` (Cero errores de TypeScript en todo el monorepo)
- `bun check` (Linter `oxlint` y formateador `oxfmt` sin errores)

---

## 🧠 Catálogo de Agent Skills del Repositorio (`.agents/skills/`)

El repositorio incluye una suite curada de **Agent Skills** en `.agents/skills/` (bloqueadas en `skills-lock.json`) que los agentes de IA deben consultar y activar según la fase del desarrollo:

| Fase                      | Skill                          | Ruta                                      | Cuándo usarla                                                                                                                                                                            |
| :------------------------ | :----------------------------- | :---------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Diseño y Dominio**   | `domain-modeling`              | `.agents/skills/domain-modeling/SKILL.md` | Al definir vocabulario ubicuo (`GLOSSARY.md`), entidades de negocio o decisiones arquitectónicas (`ADR`).                                                                                |
| **1. Diseño y Dominio**   | `codebase-design`              | `.agents/skills/codebase-design/SKILL.md` | Para diseñar módulos profundos (_deep modules_), definir interfaces simples y elegir dónde colocar los _seams_.                                                                          |
| **1. Diseño y Dominio**   | `grill-me` / `grilling`        | `.agents/skills/grill-me/SKILL.md`        | Para estresar un plan o arquitectura mediante preguntas incisivas antes de escribir código.                                                                                              |
| **1. Diseño y Dominio**   | `prototype`                    | `.agents/skills/prototype/SKILL.md`       | Cuando se necesita validar rápidamente un modelo de estado o explorar una interfaz de usuario.                                                                                           |
| **2. Especificación**     | `to-spec` / `to-tickets`       | `.agents/skills/to-spec/SKILL.md`         | Para transformar decisiones de diseño en especificaciones ejecutables y tickets verticales.                                                                                              |
| **3. Implementación TDD** | **`tdd`**                      | `.agents/skills/tdd/SKILL.md`             | **Obligatoria al programar.** Ciclo Red → Green en _seams_ acordados mediante _vertical slices_.                                                                                         |
| **3. Implementación TDD** | **`implement-issue`**          | `.agents/skills/implement-issue/SKILL.md` | **Orquestador E2E de historias (`US-XXX` / `#N`).** Integra `gh`, `grilling`, confirmación de _seams_ (`codebase-design` + `tdd`), _vertical slices_ (`ponytail`), `code-review` y `pr`. |
| **3. Implementación TDD** | `implement` / `implement-spec` | `.agents/skills/implement/SKILL.md`       | Para ejecutar planes e implementar especificaciones manteniendo simplicidad (YAGNI / `ponytail`).                                                                                        |
| **4. Revisión y PRs**     | `code-review`                  | `.agents/skills/code-review/SKILL.md`     | Etapa de revisión paralela (Standards + Spec) y refactorización posterior al ciclo Red → Green.                                                                                          |
| **4. Revisión y PRs**     | **`pr`**                       | `.agents/skills/pr/SKILL.md`              | **Obligatoria al crear PRs.** Estructura visual de PR con diagramas, evidencia Before/After y Merge Danger.                                                                              |
| **5. Diagnóstico**        | `diagnosing-bugs`              | `.agents/skills/diagnosing-bugs/SKILL.md` | Bucle sistemático de diagnóstico e hipótesis ante errores complejos o regresiones de rendimiento.                                                                                        |

## Agent skills

### Issue tracker

Las historias de usuario (`US-001` a `US-037`) y especificaciones viven en GitHub Issues (`hack-andes-buscandoanemo/andes-hack`) y se operan con `gh` CLI. Ver [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

Mapeo de etiquetas de triaje, prioridades (`prioridad:P0`, `P1`, `P2`) y épicas. Ver [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Contexto único de dominio en `AGENTS.md` / `CLAUDE.md` (más `GLOSSARY.md` y `docs/adr/` cuando aplique). Ver [`docs/agents/domain.md`](docs/agents/domain.md).

---

## Tech Stack

- **Runtime**: bun
- **Package Manager**: bun

### Frontend (`apps/web`)

- Framework: next
- CSS: tailwind
- UI Library: shadcn-ui
- Animation: framer-motion
- Forms: react-hook-form
- HTTP Client: axios
- State: zustand

### Backend (`apps/server`)

- Framework: hono
- API: openapi (`openapi-typescript`)
- Shared session, community-membership, rate-limit, and error middleware: `apps/server/src/middleware.ts` and `apps/server/src/utils/error-handler.ts`
- Validation: zod
- Rate Limiting: upstash-ratelimit

### Database (`packages/db`)

- Database: postgres (Neon)
- ORM: drizzle

### Authentication (`packages/auth`)

- Provider: better-auth

### Additional Features

- Testing: vitest
- Email: resend
- Caching: upstash-redis
- Storage: Cloudflare R2
- Analytics: Plausible Analytics (`@plausible-analytics/tracker`)
- Logging: evlog
- Linter & Formatter: oxlint + oxfmt

## Project Structure

```
andes-hack/
├── apps/
│   ├── web/         # Frontend application (Next.js, Tailwind, shadcn/ui, Zustand)
│   └── server/      # Backend API (Hono, OpenAPI, Zod, Evlog)
├── packages/
│   ├── api/         # API contracts & OpenAPI client layer
│   ├── auth/        # Authentication & session configuration (Better-Auth)
│   ├── db/          # Database schema & Drizzle ORM migrations (PostgreSQL / Neon)
│   ├── env/         # Type-safe environment variables validation (Zod)
│   ├── infra/       # Infrastructure & Cloudflare deployment config (Alchemy)
│   └── config/      # Shared TypeScript & workspace configurations
```

## Common Commands

- `bun install` - Install dependencies
- `bun dev` - Start development server (all apps)
- `bun dev:web` - Start frontend only
- `bun dev:server` - Start backend only
- `bun build` - Build for production
- `bun run test` - Run tests across workspaces
- `bun check` - Lint (`oxlint`) and format (`oxfmt --write`)
- `bun check-types` - Run TypeScript type checking across workspaces
- `bun db:push` - Push database schema
- `bun db:studio` - Open database UI
- `bun db:generate` - Generate database migrations
- `bun db:migrate` - Run database migrations

## Better Fullstack project context

`bts.jsonc` is the authority for the current Stack Graph. Its `stackParts` array owns role selection and `ownerPartId` bindings. Top-level option fields are a compatibility projection and must not become a second mutation path.

### Stack Parts, ownership, and evidence

- `backend.api:typescript:openapi`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.auth:typescript:better-auth`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.backendUtilities:typescript:backend-utils`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.caching:typescript:upstash-redis`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.email:typescript:resend`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.fileStorage:typescript:r2`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.logging:typescript:evlog`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.orm:typescript:drizzle`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.rateLimit:typescript:upstash-ratelimit`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.runtime:typescript:bun`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.testing:typescript:vitest`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.validation:typescript:zod`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend:typescript:hono`. Its generated target is `apps/server`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `codeGeneration:universal:openapi-typescript`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `codeQuality:universal:oxlint`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `containerOrchestration:universal:docker-compose`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `continuousIntegration:universal:github-actions`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `database.dbSetup:universal:neon`. It belongs to `database:universal:postgres`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `database:universal:postgres`. Its generated target is `packages/db`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend.animation:typescript:framer-motion`. It belongs to `frontend:typescript:next`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend.css:typescript:tailwind`. It belongs to `frontend:typescript:next`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend.deploy:typescript:cloudflare`. It belongs to `frontend:typescript:next`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend.forms:typescript:react-hook-form`. It belongs to `frontend:typescript:next`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend.httpClient:typescript:axios`. It belongs to `frontend:typescript:next`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend.stateManagement:typescript:zustand`. It belongs to `frontend:typescript:next`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend.ui:typescript:shadcn-ui`. It belongs to `frontend:typescript:next`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend:typescript:next`. Its generated target is `apps/web`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `gitHooks:universal:husky`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `workspaceRunner:universal:turborepo`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.

### Installed-version authority

Use `bts.jsonc` for the generator and schema version. Use local package manifests and lockfiles for installed dependency versions. Do not assume that documentation for a newer Better Fullstack release matches this project.

### Compatibility and lifecycle safety

Run `create-better-fullstack context --json` for bounded roles, capabilities, evidence, compatibility issues, and safe next actions. Run `create-better-fullstack doctor --json` before repairing graph drift. Existing-project writes must start with a plan and use the exact review token. Use `create-better-fullstack recipes check --json` before editing recipe-owned paths or managed regions, and use recipe history plus project recovery commands to undo a reviewed operation.

User code outside an explicit Better Fullstack managed region is not generator-owned. Missing or changed managed-region hashes stop recipe planning for manual review.

<!-- <better-fullstack:recipes sha256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855> -->

<!-- </better-fullstack:recipes> -->

## Maintenance

Keep AGENTS.md updated when:

- Adding/removing dependencies
- Changing project structure
- Adding new features or services
- Modifying build/dev workflows

AI assistants should suggest updates to this file when they notice relevant changes.
