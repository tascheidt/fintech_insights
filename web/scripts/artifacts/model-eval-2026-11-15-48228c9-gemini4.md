# Model eval — 2026-11-15

- git sha: `48228c9` · candidates: `gemini-4-argon`, `gemini-4-carbon`, `gemini-4-hydrogen`, `gemini-4-hydrogen@low` · judges: `gemini-4-carbon`, `gemini-pro-latest`
- baseline per surface = production `SURFACE_MODELS`. Fixtures: `scripts/model-eval/fixtures.ts`.

## What each model id actually served

| requested | served (`modelVersion`) |
|---|---|
| `gemini-flash-latest` | `gemini-3.8-flash` |
| `gemini-pro-latest` | `gemini-3.1-pro-preview` |
| `gemini-4-argon` | `gemini-4-argon` |
| `gemini-4-carbon` | `gemini-4-carbon` |
| `gemini-4-hydrogen` | `gemini-4-hydrogen` |

## Verdicts (candidate vs production, per surface)

| surface | traffic | production | `gemini-4-argon` | `gemini-4-carbon` | `gemini-4-hydrogen` | `gemini-4-hydrogen@low` |
|---|---|---|---|---|---|---|
| Job structure extraction | per-job hot path | `gemini-flash-latest` | PARITY · cost +194% | PARITY · cost +195% | PARITY · cost +90% | PARITY · cost +89% |
| Per-job strategic analysis (grounded) | per-job hot path | `gemini-pro-latest` | PARITY · cost -12% | BETTER · judged win 66% · cost +137% | WORSE · judged win 25% · cost +51% | BETTER · judged win 81% · cost -44% |
| Weekly digest company entries | weekly | `gemini-flash-latest` | BETTER · benchmark_fit +0.220 · judged win 100% · cost -11% | BETTER · benchmark_fit +0.163 · judged win 100% · cost +179% | BETTER · benchmark_fit +0.163 · judged win 100% · cost +205% | BETTER · benchmark_fit +0.220 · judged win 92% · cost -25% |
| Tech-stack enrichment | per-company weekly | `gemini-flash-latest` | BETTER · benchmark_fit +0.060 · judged win 63% · cost +35% | WORSE · benchmark_fit -0.175 · cost +50% | BETTER · judged win 88% · cost +49% | BETTER · judged win 100% · cost -24% |
| Company insight narrative | per-company weekly | `gemini-flash-latest` | WORSE · judged win 31% · cost +49% | PARITY · cost +127% | WORSE · judged win 19% · cost +44% | PARITY · cost +14% |
| Company research (type detection + grounded deep research) | per-company weekly | `gemini-flash-latest` | BETTER · type_accuracy +0.143 · cost +2% | BETTER · type_accuracy +0.143 · cost +110% | WORSE · type_accuracy -0.286 · cost +98% | BETTER · type_accuracy +0.143 · cost -29% |
| Company news context (grounded) | per-company weekly | `gemini-flash-latest` | BETTER · news_items +0.200 · cost +48% | BETTER · news_items +0.267 · cost +341% | WORSE · news_items -0.667 · cost +99% | WORSE · news_items -0.067 · cost -33% |
| Company editorial (thesis / bets) | per-company weekly | `gemini-pro-latest` | BETTER · judged win 94% · cost -29% | BETTER · judged win 100% · cost +47% | BETTER · judged win 100% · cost -23% | BETTER · judged win 94% · cost -62% |
| Cross-company theme labels | weekly | `gemini-flash-latest` | WORSE · judged win 25% · cost -11% | BETTER · judged win 63% · cost +234% | WORSE · judged win 25% · cost +92% | PARITY · cost -22% |
| Shared search report synthesis | user-triggered | `gemini-flash-latest` | BETTER · judged win 67% · cost +15% | BETTER · judged win 92% · cost +169% | MIXED · reliability 67% vs 100% · judged win 88% · cost +181% | BETTER · judged win 92% · cost -31% |
| Feedback triage | event-driven | `gemini-pro-latest` | BETTER · judged win 65% · cost -2% | BETTER · judged win 76% · cost +25% | BETTER · judged win 83% · cost -40% | BETTER · judged win 88% · cost -58% |
| Company insight chat | user-triggered | `gemini-flash-latest` | BETTER · judged win 81% · cost +32% | BETTER · judged win 100% · cost +192% | BETTER · judged win 94% · cost +60% | BETTER · judged win 94% · cost -19% |
| Job posting generator | user-triggered | `gemini-flash-latest` | PARITY · cost +51% | BETTER · judged win 92% · cost +337% | BETTER · judged win 75% · cost +124% | BETTER · judged win 83% · cost -7% |
| Strategy lab analysis | user-triggered | `gemini-flash-latest` | PARITY · cost -21% | BETTER · judged win 100% · cost +106% | BETTER · judged win 100% · cost -14% | BETTER · judged win 100% · cost -55% |
| Role categorization (backfill only) | backfill | `gemini-flash-latest` | PARITY · cost +77% | PARITY · cost +184% | PARITY · cost +14% | PARITY · cost -6% |

Verdict rule: WORSE if reliability drops, the primary metric drops >0.03, judged win-rate <40%, or voice warnings rise >0.5/case; BETTER if the primary metric rises >0.03 or judged win-rate >60% with no regression. Ties in the judge count as half a win.

## Job structure extraction (`job-structure`)

per-job hot path · internal · 24 cases · primary metric `golden_l1`

| model | ok | golden_l1 | golden_seniority_level | golden_standardized_department | golden_function_category | golden_salary | golden_location | golden_tech_stack | tech_recall | tech_precision | l1_vs_baseline | voice warn/case | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 0.981 | 1.000 | 1.000 | 1.000 | 0.889 | 1.000 | 0.996 | 1.000 | 0.993 | – | 0.0 | – | 2,321 | 244 + 0 | $0.00531 | 3.2 / 3.6 | 0 |
| `gemini-4-argon` | 100% | 0.999 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 0.995 | 1.000 | 0.992 | 82% | 0.0 | – | 2,399 | 301 + 0 | $0.01561 | 6.4 / 9.6 | 0 |
| `gemini-4-carbon` | 100% | 0.995 | 1.000 | 1.000 | 1.000 | 1.000 | 0.979 | 0.992 | 0.993 | 0.991 | 83% | 0.0 | – | 2,399 | 303 + 0 | $0.01565 | 6.1 / 7.7 | 0 |
| `gemini-4-hydrogen` | 100% | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 81% | 0.0 | – | 2,399 | 269 + 593 | $0.01007 | 4.4 / 5.2 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 82% | 0.0 | – | 2,399 | 267 + 588 | $0.01001 | 5.2 / 12.3 | 0 |

## Per-job strategic analysis (grounded) (`job-analysis`)

per-job hot path · grounded · user-facing · 8 cases · primary metric `completeness`

| model | ok | completeness | web_corroborated | same_category | same_new_direction | same_confidence | voice warn/case | judge gemini-4-carbon win (W/T/L) | judge gemini-pro-latest win (W/T/L) | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-pro-latest` (prod) | 100% | 1.000 | 1.000 | – | – | – | 0.0 | — | — | – | 2,254 | 426 + 1,430 | $0.02678 | 13.9 / 30.0 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 1.000 | 63% | 88% | 75% | 0.0 | 38% (3/0/5) | 50% (4/0/4) | 0.6 / 0.2 | 2,467 | 624 + 54 | $0.02343 | 12.6 / 30.2 | 0 |
| `gemini-4-carbon` | 100% | 1.000 | 1.000 | 88% | 88% | 63% | 0.0 | 75% (5/2/1) | 56% (4/1/3) | 0.6 / 0.3 | 2,467 | 695 + 1,992 | $0.06360 | 36.4 / 46.8 | 0 |
| `gemini-4-hydrogen` | 100% | 1.000 | 1.000 | 75% | 88% | 0% | 0.0 | 38% (2/2/4) | 13% (1/0/7) | 1.3 / 0.3 | 2,467 | 979 + 3,907 | $0.04035 | 26.1 / 32.3 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 1.000 | 75% | 88% | 25% | 0.0 | 88% (7/0/1) | 75% (5/2/1) | 0.3 / 0.4 | 2,467 | 519 + 995 | $0.01505 | 8.1 / 12.4 | 0 |

## Weekly digest company entries (`weekly-digest`)

weekly · user-facing · 3 cases · primary metric `benchmark_fit`

| model | ok | benchmark_fit | voice warn/case | judge gemini-4-carbon win (W/T/L) | judge gemini-pro-latest win (W/T/L) | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 0.780 | 0.0 | — | — | – | 1,551 | 92 + 1,276 | $0.01259 | 9.2 / 15.2 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 0.0 | 100% (3/0/0) | 100% (3/0/0) | 0.0 / 1.0 | 1,643 | 124 + 108 | $0.01120 | 4.6 / 7.5 | 0 |
| `gemini-4-carbon` | 100% | 0.943 | 0.0 | 100% (3/0/0) | 100% (3/0/0) | 0.0 / 0.5 | 1,643 | 116 + 1,314 | $0.03517 | 14.8 / 28.2 | 0 |
| `gemini-4-hydrogen` | 100% | 0.943 | 0.0 | 100% (3/0/0) | 100% (3/0/0) | 0.0 / 0.8 | 2,204 | 120 + 4,560 | $0.03841 | 18.6 / 46.6 | 1 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 0.0 | 100% (3/0/0) | 83% (2/1/0) | 0.1 / 0.7 | 1,643 | 115 + 808 | $0.00939 | 5.1 / 5.8 | 0 |

## Tech-stack enrichment (`tech-stack`)

per-company weekly · user-facing · 2 cases · primary metric `benchmark_fit`

| model | ok | benchmark_fit | llm_enriched | voice warn/case | judge gemini-4-carbon win (W/T/L) | judge gemini-pro-latest win (W/T/L) | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 0.905 | 1.000 | 0.0 | — | — | – | 1,291 | 645 + 1,265 | $0.01626 | 19.0 / 19.0 | 0 |
| `gemini-4-argon` | 100% | 0.965 | 1.000 | 0.0 | 75% (1/1/0) | 50% (1/0/1) | 0.0 / 0.0 | 1,371 | 820 + 0 | $0.02188 | 14.2 / 14.2 | 0 |
| `gemini-4-carbon` | 100% | 0.730 | 1.000 | 0.0 | 50% (1/0/1) | 50% (1/0/1) | 1.4 / 0.0 | 678 | 377 + 711 | $0.02447 | 30.0 / 30.0 | 0 |
| `gemini-4-hydrogen` | 100% | 0.905 | 1.000 | 0.0 | 100% (2/0/0) | 75% (1/1/0) | 0.0 / 0.1 | 1,371 | 919 + 2,036 | $0.02422 | 15.0 / 15.0 | 0 |
| `gemini-4-hydrogen@low` | 100% | 0.905 | 1.000 | 0.0 | 100% (2/0/0) | 100% (2/0/0) | 0.0 / 0.0 | 1,371 | 689 + 674 | $0.01228 | 7.2 / 7.2 | 0 |

## Company insight narrative (`company-insight`)

per-company weekly · user-facing · 4 cases · primary metric `completeness`

| model | ok | completeness | voice warn/case | judge gemini-4-carbon win (W/T/L) | judge gemini-pro-latest win (W/T/L) | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 1.000 | 0.5 | — | — | – | 1,436 | 510 + 909 | $0.01280 | 13.3 / 13.4 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 1.0 | 38% (0/3/1) | 25% (0/2/2) | 0.9 / 0.4 | 1,522 | 647 + 0 | $0.01903 | 12.5 / 13.2 | 0 |
| `gemini-4-carbon` | 100% | 1.000 | 0.8 | 50% (2/0/2) | 38% (1/1/2) | 0.8 / 0.3 | 1,522 | 652 + 496 | $0.02905 | 19.5 / 28.8 | 0 |
| `gemini-4-hydrogen` | 100% | 1.000 | 0.8 | 38% (1/1/2) | 0% (0/0/4) | 1.1 / 0.4 | 1,522 | 696 + 1,458 | $0.01844 | 13.0 / 13.2 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 1.0 | 75% (3/0/1) | 13% (0/1/3) | 0.9 / 0.7 | 1,522 | 485 + 1,159 | $0.01462 | 7.5 / 9.4 | 0 |

## Company research (type detection + grounded deep research) (`company-research`)

per-company weekly · grounded · internal · 10 cases · primary metric `type_accuracy`

| model | ok | type_accuracy | sources_found | verified_share | stated_strategy_found | voice warn/case | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 0.857 | 1.000 | 0.000 | 1.000 | 0.0 | – | 495 | 527 + 1,296 | $0.01441 | 11.3 / 35.2 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 1.000 | 0.000 | 1.000 | 0.0 | – | 623 | 612 + 0 | $0.01474 | 5.0 / 26.1 | 0 |
| `gemini-4-carbon` | 100% | 1.000 | 1.000 | 0.000 | 1.000 | 0.0 | – | 609 | 599 + 794 | $0.03030 | 8.8 / 49.8 | 0 |
| `gemini-4-hydrogen` | 100% | 0.571 | 1.000 | 0.000 | 1.000 | 0.0 | – | 935 | 571 + 3,050 | $0.02856 | 9.7 / 38.4 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 1.000 | 0.000 | 1.000 | 0.0 | – | 588 | 562 + 693 | $0.01029 | 2.0 / 19.5 | 0 |

## Company news context (grounded) (`company-news`)

per-company weekly · grounded · user-facing · 3 cases · primary metric `news_items`

| model | ok | news_items | items_with_source | voice warn/case | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 0.667 | 0.000 | 0.0 | – | 1,048 | 691 + 2,198 | $0.02324 | 27.7 / 46.5 | 0 |
| `gemini-4-argon` | 100% | 0.867 | 0.000 | 0.0 | – | 567 | 1,606 + 0 | $0.03439 | 22.6 / 35.5 | 0 |
| `gemini-4-carbon` | 100% | 0.933 | 0.000 | 0.0 | – | 567 | 1,956 + 3,052 | $0.10242 | 65.6 / 83.2 | 0 |
| `gemini-4-hydrogen` | 100% | 0.000 | 0.000 | 0.0 | – | 567 | 904 + 5,149 | $0.04625 | 30.7 / 46.5 | 0 |
| `gemini-4-hydrogen@low` | 100% | 0.600 | 0.000 | 0.0 | – | 567 | 1,063 + 913 | $0.01567 | 9.5 / 11.1 | 0 |

## Company editorial (thesis / bets) (`company-editorial`)

per-company weekly · user-facing · 4 cases · primary metric `bets_with_evidence`

| model | ok | bets_with_evidence | voice warn/case | judge gemini-4-carbon win (W/T/L) | judge gemini-pro-latest win (W/T/L) | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-pro-latest` (prod) | 100% | 1.000 | 0.0 | — | — | – | 1,860 | 761 + 2,065 | $0.03762 | 17.7 / 22.3 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 0.0 | 88% (3/1/0) | 100% (4/0/0) | 0.2 / 1.0 | 1,950 | 949 + 0 | $0.02678 | 14.8 / 18.6 | 0 |
| `gemini-4-carbon` | 100% | 1.000 | 0.0 | 100% (4/0/0) | 100% (4/0/0) | 0.0 / 0.9 | 1,950 | 987 + 1,379 | $0.05512 | 36.7 / 69.1 | 0 |
| `gemini-4-hydrogen` | 100% | 1.000 | 0.0 | 100% (4/0/0) | 100% (4/0/0) | 0.0 / 1.1 | 1,950 | 1,005 + 2,460 | $0.02891 | 17.9 / 19.3 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 0.0 | 88% (3/1/0) | 100% (4/0/0) | 0.3 / 1.2 | 1,950 | 820 + 695 | $0.01429 | 7.1 / 7.7 | 0 |

## Cross-company theme labels (`theme-labels`)

weekly · user-facing · 2 cases · primary metric `group_coverage`

| model | ok | group_coverage | voice warn/case | judge gemini-4-carbon win (W/T/L) | judge gemini-pro-latest win (W/T/L) | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 1.000 | 0.0 | — | — | – | 1,218 | 279 + 1,229 | $0.01313 | 13.2 / 13.2 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 0.0 | 50% (1/0/1) | 0% (0/0/2) | 0.8 / 0.1 | 1,310 | 320 + 0 | $0.01164 | 6.5 / 6.5 | 0 |
| `gemini-4-carbon` | 100% | 1.000 | 0.0 | 100% (2/0/0) | 25% (0/1/1) | 0.4 / 0.4 | 1,310 | 332 + 1,600 | $0.04387 | 26.0 / 26.0 | 0 |
| `gemini-4-hydrogen` | 100% | 1.000 | 0.0 | 50% (1/0/1) | 0% (0/0/2) | 0.9 / 0.3 | 1,310 | 319 + 2,789 | $0.02527 | 14.8 / 14.8 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 0.0 | 50% (1/0/1) | 50% (1/0/1) | 0.5 / 0.4 | 1,310 | 298 + 814 | $0.01030 | 6.4 / 6.4 | 0 |

## Shared search report synthesis (`search-report`)

user-triggered · user-facing · 3 cases · primary metric `has_groups`

| model | ok | has_groups | has_requirements | voice warn/case | judge gemini-4-carbon win (W/T/L) | judge gemini-pro-latest win (W/T/L) | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 1.000 | 1.000 | 0.0 | — | — | – | 5,590 | 356 + 2,085 | $0.02669 | 15.9 / 24.2 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 1.000 | 0.0 | 100% (3/0/0) | 33% (1/0/2) | 0.3 / 0.3 | 5,660 | 399 + 0 | $0.03061 | 7.4 / 9.0 | 0 |
| `gemini-4-carbon` | 100% | 1.000 | 1.000 | 0.0 | 100% (3/0/0) | 83% (2/1/0) | 0.1 / 0.3 | 5,660 | 430 + 2,032 | $0.07187 | 29.9 / 83.9 | 1 |
| `gemini-4-hydrogen` | 67% | 1.000 | 1.000 | 0.0 | 100% (2/0/0) | 75% (1/1/0) | 0.0 / 0.0 | 14,301 | 240 + 6,906 | $0.07504 | 37.5 / 37.5 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 1.000 | 0.0 | 100% (3/0/0) | 83% (2/1/0) | 0.1 / 0.3 | 5,660 | 365 + 944 | $0.01830 | 5.7 / 9.9 | 0 |

## Feedback triage (`feedback-triage`)

event-driven · internal · 22 cases · primary metric `drafted_issue`

| model | ok | drafted_issue | same_decision | voice warn/case | judge gemini-4-carbon win (W/T/L) | judge gemini-pro-latest win (W/T/L) | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-pro-latest` (prod) | 100% | 1.000 | – | 0.0 | — | — | – | 1,138 | 516 + 868 | $0.01888 | 10.7 / 15.0 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 86% | 0.0 | 77% (17/0/5) | 52% (9/5/8) | 0.6 / 0.8 | 1,225 | 595 + 82 | $0.01844 | 12.4 / 16.9 | 0 |
| `gemini-4-carbon` | 100% | 1.000 | 77% | 0.0 | 86% (18/2/2) | 66% (12/5/5) | 0.5 / 1.0 | 1,225 | 609 + 330 | $0.02367 | 16.6 / 24.7 | 1 |
| `gemini-4-hydrogen` | 100% | 1.000 | 82% | 0.0 | 91% (20/0/2) | 75% (14/5/3) | 0.3 / 1.1 | 1,225 | 555 + 714 | $0.01136 | 7.1 / 11.4 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 86% | 0.0 | 86% (19/0/3) | 89% (18/3/1) | 0.3 / 1.1 | 1,225 | 460 + 345 | $0.00787 | 4.5 / 5.7 | 0 |

## Company insight chat (`insight-chat`)

user-triggered · user-facing · 4 cases

| model | ok | voice warn/case | judge gemini-4-carbon win (W/T/L) | judge gemini-pro-latest win (W/T/L) | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 0.0 | — | — | – | 862 | 464 + 749 | $0.01039 | 12.3 / 13.2 | 0 |
| `gemini-4-argon` | 100% | 0.0 | 75% (3/0/1) | 88% (3/1/0) | 0.0 / 0.1 | 885 | 509 + 0 | $0.01371 | 12.1 / 13.1 | 0 |
| `gemini-4-carbon` | 100% | 0.0 | 100% (4/0/0) | 100% (4/0/0) | 0.0 / 0.0 | 885 | 431 + 911 | $0.03037 | 23.1 / 23.3 | 0 |
| `gemini-4-hydrogen` | 100% | 0.3 | 100% (4/0/0) | 88% (3/1/0) | 0.0 / 0.1 | 885 | 503 + 1,531 | $0.01658 | 12.0 / 12.1 | 0 |
| `gemini-4-hydrogen@low` | 100% | 0.0 | 100% (4/0/0) | 88% (3/1/0) | 0.0 / 0.1 | 885 | 330 + 622 | $0.00847 | 6.2 / 6.4 | 0 |

## Job posting generator (`posting-generator`)

user-triggered · user-facing · 3 cases · primary metric `has_sections`

| model | ok | has_sections | voice warn/case | judge gemini-4-carbon win (W/T/L) | judge gemini-pro-latest win (W/T/L) | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 1.000 | 0.0 | — | — | – | 1,940 | 482 + 665 | $0.01151 | 10.4 / 10.4 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 0.0 | 67% (2/0/1) | 50% (1/1/1) | 0.9 / 1.0 | 1,958 | 477 + 0 | $0.01738 | 9.7 / 13.5 | 0 |
| `gemini-4-carbon` | 100% | 1.000 | 0.0 | 100% (3/0/0) | 83% (2/1/0) | 0.3 / 1.0 | 1,958 | 463 + 1,662 | $0.05033 | 26.1 / 32.8 | 0 |
| `gemini-4-hydrogen` | 100% | 1.000 | 0.0 | 83% (2/1/0) | 67% (2/0/1) | 0.1 / 1.0 | 1,958 | 485 + 2,558 | $0.02576 | 15.2 / 19.4 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 0.0 | 100% (3/0/0) | 67% (2/0/1) | 0.1 / 1.2 | 1,958 | 423 + 608 | $0.01067 | 6.4 / 6.5 | 0 |

## Strategy lab analysis (`strategy-lab`)

user-triggered · user-facing · 2 cases · primary metric `has_initiatives`

| model | ok | has_initiatives | voice warn/case | judge gemini-4-carbon win (W/T/L) | judge gemini-pro-latest win (W/T/L) | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 1.000 | 0.0 | — | — | – | 919 | 514 + 2,301 | $0.02249 | 25.7 / 25.7 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 0.0 | 75% (1/1/0) | 25% (0/1/1) | 1.1 / 1.3 | 1,012 | 690 + 0 | $0.01784 | 14.5 / 14.5 | 0 |
| `gemini-4-carbon` | 100% | 1.000 | 0.0 | 100% (2/0/0) | 100% (2/0/0) | 0.6 / 1.8 | 1,012 | 600 + 1,511 | $0.04626 | 31.4 / 31.4 | 0 |
| `gemini-4-hydrogen` | 100% | 1.000 | 0.0 | 100% (2/0/0) | 100% (2/0/0) | 0.5 / 1.9 | 1,012 | 595 + 1,782 | $0.01934 | 11.0 / 11.0 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 0.0 | 100% (2/0/0) | 100% (2/0/0) | 0.4 / 2.0 | 1,012 | 532 + 620 | $0.01015 | 6.2 / 6.2 | 0 |

## Role categorization (backfill only) (`categorize`)

backfill · internal · 12 cases · primary metric `golden_category`

| model | ok | golden_category | voice warn/case | major issues cand/base | in tok | out+think tok | $/case | p50 / p95 s | err calls |
|---|---|---|---|---|---|---|---|---|---|
| `gemini-flash-latest` (prod) | 100% | 1.000 | 0.0 | – | 2,513 | 458 + 595 | $0.01167 | 8.9 / 11.2 | 0 |
| `gemini-4-argon` | 100% | 1.000 | 0.0 | – | 2,586 | 516 + 0 | $0.02066 | 7.4 / 13.7 | 0 |
| `gemini-4-carbon` | 100% | 1.000 | 0.0 | – | 2,586 | 495 + 645 | $0.03314 | 15.3 / 24.5 | 0 |
| `gemini-4-hydrogen` | 100% | 1.000 | 0.0 | – | 2,586 | 489 + 775 | $0.01336 | 6.7 / 8.7 | 0 |
| `gemini-4-hydrogen@low` | 100% | 1.000 | 0.0 | – | 2,586 | 434 + 512 | $0.01098 | 4.9 / 7.2 | 0 |
