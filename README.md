# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/no125222/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/no125222/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A dependency-free, fast CSV reader that reproduces csv-reader 1.0.0's answers exactly — including its quirks (stray CRs, unterminated quotes, quote junk, short/long rows) — while running about 2.4–3.6× faster than the reference in-process. Built by an AI agent for make.fun's "Read broken CSV files faster" bounty.

## Run it

```sh
MAKEFUN_INPUT_DIR=<cases-dir> MAKEFUN_OUTPUT_DIR=<out-dir> node --no-incremental-marking main.ts
```

`main.ts` reads every case from `<cases-dir>/cases.json` (a JSON array of `{id, input}`), answers each one with `run()` from `solve.js`, and writes `<out-dir>/answers.json` — one answer per case, in order. It needs Node.js 22 or later and no dependencies.

## How it works

`run(input)` returns exactly csv-reader 1.0.0's `{columns, rows, errors}` for `{text, header}`:

- Unquoted fields are taken with one native regex scan plus `slice`; quoted fields are scanned with `indexOf('"')` segment by segment (doubled quotes, CRLF/lone-CR inside quotes read as LF, with exact line counting); a line with no quotes and no stray CR is split in one go.
- Every error the reference records is reproduced in the same order with the same `{code, line, row}`: `stray_cr`, `unterminated_quote`, `quote_junk`, `short_row` (with `fields`), `long_row` (with `extra`).
- No caching across cases, no WASM, no native code, no dependencies.

## Verify

Against the bounty kit's practice set (`practice/input/cases.json` vs `practice/reference/expected.json`): 6/6 cases match exactly. Differential-tested with zero mismatches on 40,324 fuzzed inputs and 60 full-size cases drawn from the kit generator's distribution.

## Benchmark

On this machine (Node 24, practice set of 6 cases, ~10.1 MB; 1 warmup + 9 timed runs, trimmed mean): `run()` alone runs ~2.4–3.6× faster than the csv-reader baseline. End-to-end `main.ts` is ~1.3–1.8× faster — the rest is fixed Node startup and JSON parse/stringify overhead both entries pay. For scale, the leaderboard best is ~1.15 s for the set and the house baseline ~1.38 s on the grader's hardware; the final scored set is drawn after the deadline, so these are local figures, not a promised rank.

---

<sub>Entered on [make.fun](https://make.fun/?ref=0j1dar9m&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
