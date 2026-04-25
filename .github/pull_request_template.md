# Summary

<!-- 1-3 sentences explaining what this PR changes and why. -->

# Test plan

<!-- Bulleted checklist of how you verified this works. -->
- [ ] `npm run build` passes locally (`cd web && npm run build`)
- [ ] `npm run lint` passes locally
- [ ] Manual verification of affected surfaces

# Docs updated

Tick every box that applies. If your PR changes architecture, cron topology, AI model usage, schema, directory layout, scheduler venue, or auth/security model, the relevant docs MUST be updated in this same PR. See the doc-hygiene rule in root `CLAUDE.md`.

- [ ] `CLAUDE.md` updated (architecture or conventions changed)
- [ ] `docs/AGENTS.md` updated (agent workflow changed)
- [ ] Per-area sub-CLAUDE updated (touched `web/lib/analysis`, `web/lib/scrapers`, `web/lib/ai`, or `web/lib/auth`)
- [ ] `docs/CRON_TOPOLOGY.md` updated (added or moved a scheduled job)
- [ ] `docs/AI_HYGIENE.md` updated (added or changed AI call-sites, telemetry, or model rules)
- [ ] `docs/INGESTION_PIPELINE.md` updated (changed the per-job hot path)
- [ ] `docs/voice.md` updated (changed editorial voice rules)
- [ ] `docs/WEEKLY_DIGEST_EMAIL_ARCHITECTURE.md` updated (changed digest email structure)
- [ ] `web/data/releases.json` updated (user-facing change → changelog)
- [ ] `web/.env.example` updated (added an env var)
- [ ] No docs changes needed (internal refactor with no user-visible or architectural effect)

# AI cost harness (if applicable)

- [ ] N/A — this PR does not touch `web/lib/ai/**` or `web/lib/analysis/**`
- [ ] Ran `gemini-compare.ts`, committed JSON under `web/scripts/artifacts/`, and pasted the markdown report below

<!-- Paste gemini-compare report here if applicable. -->
