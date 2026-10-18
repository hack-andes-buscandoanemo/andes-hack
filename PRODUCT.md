# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Verified members of partner organizations in Lima who want to share recurring commutes to the same workplace. The MVP starts with private companies; universities and public entities are later phases.
- Members who drive with a verified vehicle and members who ride as passengers; one member may use either role.
- Community administrators who manage organization-level incident reports.

## Product Purpose

Te Jalo connects members of the same verified organization whose routes and schedules are compatible, so colleagues can coordinate shared rides and make better use of available car seats. It aims to make the commute more predictable through agreed schedules and meeting points, and to reduce solo car trips. Measure impact as net car trips avoided, separately from people transported.

## Positioning

Te Jalo is a closed, institutionally verified carpooling community. Its matching considers route and schedule compatibility between members of the same organization. It does not promise absolute safety or faster travel. The app does not charge: its fuel estimate is a reference for a voluntary contribution arranged outside the app.

## Operating Context

The product serves recurring commutes in Lima. Its main journey is institutional sign-in, home, passenger trip search and detail, driver trip offering and request management, trip chat, and profile and security. Profile and security remain available from the main navigation.

## Capabilities and Constraints

- Organization membership is verified through an access code or institutional email. A driver must register a verified vehicle.
- Members can publish recurring routes, schedules, waypoints, and available seats; passengers can find compatible trips and request a seat; drivers can review and accept requests; trip members can coordinate in chat.
- The fuel estimate is informational and may describe a voluntary contribution per occupant. Do not present it as a fare or payment collected by Te Jalo.
- Closed communities, verified membership, women-only travel preferences, and trusted-contact sharing support safety by design; none guarantees a safe trip.
- Trip history may be retained in anonymized form after account deletion. Incident reports are restricted to community administrators, and reporter identity is not returned. Public statistics are aggregate and suppress small groups.
- Use “net car trips avoided” for the impact metric; passengers who previously used public transport do not count as avoided car trips.

## Brand Commitments

The product name is Te Jalo. The product serves Lima and its user-facing experience is in Spanish. For `apps/web`, visual work extends the existing app design system while allowing purposeful variation by screen.

## Evidence on Hand

- The demo community is Comunidad Alfa and uses real users; do not invent synthetic participants or testimonials.
- The `/datos` screen and `packages/matching/src/metrics.ts` define the public impact and net avoided-car-trip metric.
- `docs/decisiones/0001-sin-pagos-en-la-app.md` records the no-payments constraint; `docs/decisiones/0003-metrica-viajes-en-auto-evitados.md` records the impact metric.
- `GET /public/communities/{slug}/stats` exposes aggregates and suppresses counts from 1 to 9.
- Do not invent measured results, customer claims, testimonials, or safety outcomes.

## Product Principles

1. Build trust through verified communities and clear controls without claiming absolute safety.
2. Make shared travel easier to coordinate without promising that it is faster.
3. Keep all payments outside the app; fuel figures are estimates for voluntary contributions.
4. Report net car trips avoided separately from the number of people transported.
5. Protect personal information and show public impact only as privacy-preserving aggregates.
