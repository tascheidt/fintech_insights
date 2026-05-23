# Design Decisions & Rationale

## Matrix time window independent of page time range (2026-03)
- Decision: CompetitiveMatrix has its own time window controls, independent of the page-level chart range
- Rationale: The matrix serves a different analytical purpose than the trend charts. The chart range affects sparklines and the net hiring flow chart; the matrix window affects the competitive snapshot.
- Implementation: Separate URL params (`matrixWindow`, `matrixScope`) vs. page-level `range`
- Trade-off: Two controls on same page creates disambiguation burden — must label the page-level control

## Always show all tracked companies in matrix (2026-03)
- Decision: Removed filter on `row.total > 0` — companies with zero active jobs (e.g. Wealthsimple) now appear
- Rationale: Absence of hiring is itself a signal. Hiding a company because they have 0 jobs removes competitive intelligence.
- Trade-off: Rows with all-zero data add visual weight with no informational density; mitigated by reduced opacity treatment

## 7d Net column hidden in historical mode (2026-03)
- Decision: 7d Net column is only rendered in "Current" mode
- Rationale: Weekly net change over a multi-week lookback window is semantically meaningless
- No trade-off — this is unambiguously correct

## Cell color highlighting (green/red) Current mode only (2026-03)
- Decision: bg-green-50/bg-red-50 cell highlights only shown in Current mode
- Rationale: Same as 7d Net — weekly change signals don't apply to historical windows
