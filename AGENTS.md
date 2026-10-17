# andes-hack

This file provides context about the project, domain model, and technical stack for AI assistants and autonomous coding agents.

## Project Overview & Domain Context

- **Project Name**: Andes Hack (Organización: `hack-andes-buscandoanemo`)
- **Domain**: Smart Shared Mobility / Community & Corporate Carpooling in Lima, Peru.
- **Ecosystem**: TypeScript Monorepo (Bun + Turborepo)

### Product Description

**Andes Hack** es una plataforma inteligente de movilidad compartida que conecta a miembros de entidades públicas y privadas aliadas con miembros verificados que tienen vehículos dentro de sus propias comunidades y que ya realizan recorridos similares.

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

## 🏆 Rúbrica de Evaluación del Hackathon (Guía de Priorización)

**Distribución Total:** **Técnico 75%** · **Producto 25%** · *Cada criterio se puntúa de 1 a 5.*

Todo agente de IA o desarrollador debe tomar decisiones de arquitectura, implementación y documentación optimizando directamente estos 5 criterios:

| Peso | Categoría | Criterio | Descripción Oficial | Cómo debe actuar el Agente de IA |
| :---: | :---: | :--- | :--- | :--- |
| **30%** | **Técnico** | **Complejidad técnica** | Integraciones, datos, modelos y arquitectura. | Diseñar una arquitectura robusta en el monorepo: algoritmo de *Smart Matching* geoespacial/temporal bien modelado, esquemas relacionales sólidos en Drizzle (`packages/db`), caché/ratelimit con Upstash Redis, contratos OpenAPI tipados de extremo a extremo y validación estricta con Zod. |
| **25%** | **Técnico** | **Funciona** | Flujo completo en vivo desde la URL pública. | Priorizar flujos *End-to-End (E2E)* completamente operativos y desplegables sin errores en producción. Nunca dejar vistas rotas, mocks incompletos en rutas críticas ni migraciones pendientes. |
| **20%** | **Técnico** | **Calidad técnica** | El jurado revisa tu repo en GitHub. | Mantener un historial de Git impecable mediante **Strict TDD**, **PRs / Stacked PRs**, commits semánticos, cero errores de tipos (`bun check-types`) y linter limpio (`bun check`). |
| **15%** | **Producto** | **Problema e impacto** | Un usuario real de tu track. | Enfocar cada pantalla y flujo en resolver el dolor real del ciudadano en Lima: seguridad en comunidades verificadas, ahorro frente a taxis/gasolina, cero colas en hora punta y métrica visible de vehículos retirados de circulación. |
| **10%** | **Producto** | **Claridad** | Explicas decisiones y tradeoffs. | Documentar explícitamente el *porqué* de las decisiones técnicas y los *tradeoffs* tanto en las descripciones de los Pull Requests como en la documentación del repositorio. |

---

## ⚠️ Reglas Estrictas de Ingeniería (MANDATORY WORKFLOW)

Estas reglas son **innegociables** para cualquier agente de IA o miembro del equipo que modifique el código:

### 1. Strict TDD (Test-Driven Development Estricto)

Ninguna funcionalidad de negocio, endpoint de API, lógica de emparejamiento o utilidad puede implementarse sin escribir primero su prueba automatizada con **Vitest**.

1. 🔴 **RED (Escribir prueba que falle)**:
   - Antes de escribir código de producción, crea o actualiza el archivo `*.test.ts` / `*.spec.ts` correspondiente definiendo el comportamiento esperado y los casos borde.
   - Ejecuta `bun test` y verifica que la prueba falle por la razón correcta.
2. 🟢 **GREEN (Implementación mínima para pasar)**:
   - Escribe únicamente el código de producción necesario para que la prueba pase.
   - Ejecuta `bun test` y confirma que todas las pruebas estén en verde.
3. 🔵 **REFACTOR (Limpieza y optimización)**:
   - Refactoriza el código eliminando duplicación, mejorando nombres, tipado e integraciones manteniendo las pruebas en verde.
   - Ejecuta `bun check` (`oxlint` + `oxfmt`) y `bun check-types`.

### 2. Siempre PRs o Stacked PRs usando GitHub CLI (`gh`)

**Está estrictamente prohibido hacer push directo a `main` para desarrollar features o fixes.** Todo cambio debe entrar mediante Pull Requests pequeños, atómicos y revisables usando `gh` CLI (recuerda que el jurado evalúa el **20% de Calidad Técnica** inspeccionando el repositorio en GitHub).

#### Flujo Estándar de PR Individual:
```bash
# 1. Crear rama descriptiva desde main actualizado
git checkout main && git pull origin main
git checkout -b feat/matching-engine-core

# 2. Desarrollar siguiendo el ciclo RED -> GREEN -> REFACTOR y validar gates
bun test && bun check-types && bun check

# 3. Commit semántico (Conventional Commits) y push de la rama
git add .
git commit -m "feat(matching): implement geospatial route compatibility scorer"
git push -u origin feat/matching-engine-core

# 4. Crear PR con GitHub CLI incluyendo Decisiones y Tradeoffs (10% Claridad)
gh pr create \
  --base main \
  --head feat/matching-engine-core \
  --title "feat(matching): geospatial & schedule route compatibility engine" \
  --body "## Resumen
Implementa el motor de emparejamiento de rutas y horarios entre miembros verificados.

## Evidencia TDD
- Pruebas unitarias en \`apps/server/src/...\` cubriendo coincidencia espacial, ventana horaria y asientos disponibles.

## Decisiones Técnicas y Tradeoffs
- Se eligió cálculo de bounding-box + distancia Haversine en memoria previo al filtro SQL para reducir latencia en consultas recurrentes."
```

#### Flujo de Stacked PRs (PRs Apilados para Features Complejas):
Cuando una funcionalidad grande se divide en capas (ej. `1. Schema DB` → `2. Backend API` → `3. Frontend UI`), utiliza **Stacked PRs** apuntando cada rama a su rama padre con `--base`:

```bash
# Capa 1: Base de datos (apunta a main)
git checkout -b feat/01-trips-schema main
# ... TDD + commit ...
git push -u origin feat/01-trips-schema
gh pr create --base main --head feat/01-trips-schema --title "feat(db): [1/3] add trips and routes schema" --body "..."

# Capa 2: API Backend (nace de feat/01-trips-schema y apunta a feat/01-trips-schema)
git checkout -b feat/02-trips-api feat/01-trips-schema
# ... TDD + commit ...
git push -u origin feat/02-trips-api
gh pr create --base feat/01-trips-schema --head feat/02-trips-api --title "feat(api): [2/3] add trip matching endpoints" --body "..."

# Capa 3: UI Frontend (nace de feat/02-trips-api y apunta a feat/02-trips-api)
git checkout -b feat/03-trips-ui feat/02-trips-api
# ... TDD + commit ...
git push -u origin feat/03-trips-ui
gh pr create --base feat/02-trips-api --head feat/03-trips-ui --title "feat(web): [3/3] add trip search and cost-sharing view" --body "..."
```

### 3. Quality Gates Obligatorios antes de abrir o fusionar un PR

Ningún PR puede abrirse ni darse por completado sin que estos 3 comandos terminen con código de salida `0`:
- `bun test` (Suite de pruebas unitarias/integración en verde)
- `bun check-types` (Cero errores de TypeScript en todo el monorepo)
- `bun check` (Linter `oxlint` y formateador `oxfmt` sin errores)

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
- `bun test` - Run tests across workspaces
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
