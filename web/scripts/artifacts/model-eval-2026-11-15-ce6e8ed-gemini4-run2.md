# Model eval — 2026-11-15

- git sha: `ce6e8ed` · candidates: `gemini-4-hydrogen@low`, `gemini-4-argon` · judges: `gemini-4-carbon`, `gemini-pro-latest`
- baseline per surface = production `SURFACE_MODELS`. Fixtures: `scripts/model-eval/fixtures.ts`.

## What each model id actually served

| requested | served (`modelVersion`) |
|---|---|
| `gemini-pro-latest` | `gemini-3.1-pro-preview` |
| `gemini-flash-latest` | `gemini-3.8-flash` |
| `gemini-4-hydrogen` | `gemini-4-hydrogen` |
| `gemini-4-argon` | `gemini-4-argon` |
| `gemini-4-carbon` | `gemini-4-carbon` |

## Verdicts (candidate vs production, per surface)

| surface | traffic | production | `gemini-4-hydrogen@low` | `gemini-4-argon` |
|---|---|---|---|---|
| Per-job strategic analysis (grounded) | per-job hot path | `gemini-pro-latest` | BETTER · judged win 75% · cost -48% | PARITY · cost -24% |
| Company research (type detection + grounded deep research) | per-company weekly | `gemini-flash-latest` | BETTER · type_accuracy +0.286 · cost -31% | BETTER · type_accuracy +0.286 · cost +4% |
| Company news context (grounded) | per-company weekly | `gemini-flash-latest` | WORSE · news_items -0.067 · cost -6% | BETTER · news_items +0.200 · cost +81% |
| Company insight narrative | per-company weekly | `gemini-flash-latest` | BETTER · judged win 100% · cost +17% | BETTER · judged win 63% · cost +60% |
| Cross-company theme labels | weekly | `gemini-flash-latest` | WORSE · judged win 13% · cost -15% | WORSE · judged win 25% · cost -20% |

Verdict rule: WORSE if reliability drops, the primary metric drops >0.03, judged win-rate <40%, or voice warnings rise >0.5/case; BETTER if the primary metric rises >0.03 or judged win-rate >60% with no regression. Ties in the judge count as half a win.

## Per-job strategic analysis (grounded) (`job-analysis`)

per-job hot path · grounded · user-facing · 8 cases · primary metric `completeness`

| model | ok | completeness | web_corroborated | same_category | same_new_direction | same_confidence | voice warn/case | judge gemini-4-carbon win (W/T/L) | judge gemini-pro-latest win (W/T/L) | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-pro-latest` (prod) | 100% | 1.000 | 1.000 | – | – | – | 0.0 | — | — | – | 2,286 | 435 + 1,524 | $0.02808 | 14.1 / 26.5 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 1.000 | 88% | 75% | 25% | 0.0 | 88% (7/0/1) | 63% (4/2/2) | 0.4 / 0.7 | 2,468 | 533 + 937 | $0.01472 | 7.9 / 10.7 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 1.000 | 75% | 88% | 75% | 0.0 | 56% (4/1/3) | 63% (5/0/3) | 0.3 / 0.4 | 2,468 | 542 + 36 | $0.02143 | 12.5 / 22.1 | 0 |

## Company research (type detection + grounded deep research) (`company-research`)

per-company weekly · grounded · internal · 10 cases · primary metric `type_accuracy`

| model | ok | type_accuracy | sources_found | verified_share | stated_strategy_found | voice warn/case | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 0.714 | 1.000 | 0.000 | 1.000 | 0.0 | – | 525 | 544 + 1,262 | $0.01433 | 13.4 / 27.2 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 1.000 | 0.000 | 1.000 | 0.0 | – | 588 | 553 + 638 | $0.00982 | 2.5 / 16.7 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 1.000 | 0.000 | 1.000 | 0.0 | – | 646 | 614 + 0 | $0.01486 | 5.0 / 26.1 | 0 |

## Company news context (grounded) (`company-news`)

per-company weekly · grounded · user-facing · 3 cases · primary metric `news_items`

| model | ok | news_items | items_with_source | voice warn/case | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 0.667 | 0.000 | 0.0 | – | 585 | 722 + 1,628 | $0.01851 | 23.4 / 27.8 | 0 |
| `gemini-4-hydrogen@low` | 100% | 0.600 | 0.000 | 0.0 | – | 567 | 1,088 + 1,124 | $0.01745 | 11.7 / 15.0 | 0 |
| `gemini-4-argon` | 100% | 0.867 | 0.000 | 0.0 | – | 567 | 1,560 + 0 | $0.03347 | 29.2 / 33.6 | 0 |

## Company insight narrative (`company-insight`)

per-company weekly · user-facing · 4 cases · primary metric `completeness`

| model | ok | completeness | voice warn/case | judge gemini-4-carbon win (W/T/L) | judge gemini-pro-latest win (W/T/L) | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 1.000 | 0.5 | — | — | – | 1,436 | 462 + 936 | $0.01264 | 13.9 / 14.9 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 1.0 | 100% (4/0/0) | 100% (4/0/0) | 0.0 / 0.8 | 1,522 | 584 + 1,092 | $0.01485 | 8.1 / 10.1 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 0.8 | 75% (3/0/1) | 50% (1/2/1) | 0.0 / 0.3 | 1,522 | 708 + 0 | $0.02024 | 11.9 / 14.7 | 0 |

## Cross-company theme labels (`theme-labels`)

weekly · user-facing · 2 cases · primary metric `group_coverage`

| model | ok | group_coverage | voice warn/case | judge gemini-4-carbon win (W/T/L) | judge gemini-pro-latest win (W/T/L) | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 1.000 | 0.0 | — | — | – | 1,218 | 278 + 1,425 | $0.01459 | 14.4 / 14.4 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 0.0 | 25% (0/1/1) | 0% (0/0/2) | 0.9 / 0.1 | 1,310 | 300 + 1,086 | $0.01236 | 8.1 / 8.1 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 0.0 | 50% (1/0/1) | 0% (0/0/2) | 0.9 / 0.3 | 1,310 | 321 + 0 | $0.01166 | 8.9 / 8.9 | 0 |
