# Partial runs (kept for the record)

Single-section or errored runs from choosing the cloud model and thinking level (2026-11-12 to 11-14). They were written
before the benchmark saved one file per run, so their `summary` can show `0/6` for sections that never ran. Read the
`log` field, not the summary.

| File | What it is |
|---|---|
| `cloud-gemini-3.5-flash-MINIMAL.json` | maths crops only, early run |
| `cloud-gemini-3.5-flash-lite-MINIMAL.json` | batched point checks only (section D): 4/4; the other sections did not run |
| `cloud-gemini-3.5-flash.json` | stopped by the free-tier quota (429) — one reason REDPEN switches to a fallback model on quota errors |
| `cloud-gemini-3.8-flash-MINIMAL.json` | the model rejected thinking level MINIMAL — why REDPEN retries without a thinking level when a model refuses one |
| `cloud-gemini-3.8-flash-lite-MINIMAL.json` | model not available to the project at the time |

The complete runs at production settings are `../cloud-gemini-3.5-flash-lite-MINIMAL-all-2026-11-14*.json`.
