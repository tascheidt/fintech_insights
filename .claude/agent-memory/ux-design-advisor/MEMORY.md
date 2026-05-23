# UX Design Advisor — Memory Index

## Patterns & Conventions
- [dashboard-patterns.md](./dashboard-patterns.md) — Established UI patterns, component conventions, layout decisions

## Design Decisions
- [design-decisions.md](./design-decisions.md) — Rationale behind key design choices

## Tier/role variant rendering audit (May 2026 lesson)

Phase 2's incumbent integration shipped `{isIncumbent ? <IncumbentBranch /> : <FintechBranch />}` on `companies/[slug]/page.tsx`. The new incumbent branch was clean visually — `TierBadge` pill, context callout, "Senior hiring signal" panel — but silently **dropped** the `latestInsight` rendering block that the fintech branch had. The page query still loaded `latestInsight` for both branches, so admin-generated insights for incumbents went nowhere on the page even when the data existed.

**Design-review rule:** when reviewing a "lens / variant" rendering of an existing page, ask explicitly what happens to every block on the original. Tier-variant audits should produce a kept / dropped / replaced row for every conditional render block in the source. Don't approve a "minimal variant" without that audit.
