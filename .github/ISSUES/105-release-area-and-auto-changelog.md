# 105 – Release Area in App + Auto Changelog + Agent Rules

## TL;DR

Add a visible “Release” or “Changelog” area in the app that shows what changed in each release, plus tooling/process to automatically maintain that log. Document in agent rules (e.g. CLAUDE.md / .cursor/rules) so agents always update the release log when shipping changes.

## Current vs Expected

| Current | Expected |
|--------|----------|
| No dedicated release/changelog surface in the app. | Clear release area in the app (e.g. /releases or section in settings/about) listing versions and changes. |
| Changelog/release notes are ad hoc or absent. | Automated or semi-automated log of changes (e.g. from conventional commits, PR titles, or a single source-of-truth file). |
| Agent rules don’t mention releases. | Agent rules explicitly require updating the release log when making user-facing or notable changes. |

## Key Requirements

### 1. Release area in the application
- Dedicated UI: e.g. `/releases`, `/changelog`, or a “Releases” section in dashboard/settings/about.
- Display version (or date) and a list of changes per release.
- Notion-style, consistent with rest of app; readable and scannable.

### 2. Underlying updates for automatic change log
- **Option A:** Single source of truth (e.g. `CHANGELOG.md` or `web/content/releases.json`) that a script or CI can use to drive the in-app release area.
- **Option B:** Derive from git (e.g. conventional commits, tags, or release branches) and generate the log at build time or via a script.
- **Option C:** Hybrid: maintain a minimal hand-written log (or PR-based notes) and have a script aggregate it into the format consumed by the app.
- Decide where the canonical log lives (repo root vs `web/`) and how the app loads it (static file, API, or build-time injection).

### 3. Agent rules
- Add a short “Release / Changelog” subsection to `CLAUDE.md` (and optionally `.cursor/rules/` if used).
- Rules should state: when making user-facing or otherwise notable changes, update the release log (and where to update it: file path + format).
- Optionally: link to a one-line “how to add an entry” (e.g. “Add a bullet under the current version in `CHANGELOG.md`”).

## Relevant Files

- `CLAUDE.md` – Add release/changelog instructions for agents.
- `.cursor/rules/` – If present, add or extend a rule for release-log updates.
- New or existing: `CHANGELOG.md` or `web/content/releases.json` (or equivalent) – canonical change log.
- New: `web/app/(dashboard)/releases/page.tsx` (or equivalent) – Release area UI.
- Possibly: `web/scripts/` or root script – script to generate or validate the log from git/source.
- `web/lib/` or `web/app/api/` – If changelog is loaded via API or build step.

## Risks / Notes

- If the log is generated from git, ensure merge squashing or commit style doesn’t drop important entries; may need to rely on PR titles or a hand-maintained file instead.
- Keep format simple (e.g. Markdown or JSON) so both humans and the app can read it without heavy tooling.

## Labels

- **Type:** feature
- **Priority:** normal
- **Effort:** medium
