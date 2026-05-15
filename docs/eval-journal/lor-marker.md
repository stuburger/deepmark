# LoR Marker Eval Journal

Append-only log of LoR marker performance against the Exemplar Reference Bank.
Each section is one eval run. New runs are prepended. Drift over time shows up
as a row-by-row diff against the previous run.

Glyphs: ✓ exact Level match · ~ ±1 Level · ✗ Level off by 2+ · ✓ trap / ✗ trap (Fake-L3/L4 → must NOT exceed Level cap) · ERR runtime failure.

---

## Run: 2026-05-15 16:57 — abd18e3

**Summary**: 35/72 exact · 19 near · 1 fail · 17 traps caught · 0 traps promoted · 0 errors

| Question | Answer | Marks | Expected | Got | Status |
|---|---|---|---|---|---|
| freshblend-q1 | L1 | 4 | L1 (1–2/4) | L1 (2/4) | ✓ |
| freshblend-q1 | L2 | 4 | L2 (2–3/4) | L2 (3/4) | ✓ |
| freshblend-q1 | L3 | 4 | L3 (4–4/4) | L3 (4/4) | ✓ |
| freshblend-q1 | Fake-L3 | 4 | ≤L2 (≤3/4) | L2 (3/4) | ✓ trap |
| techfix-q1 | L1 | 6 | L1 (1–2/6) | L2 (4/6) | ~ |
| techfix-q1 | L2 | 6 | L2 (3–4/6) | L3 (6/6) | ~ |
| techfix-q1 | L3 | 6 | L3 (5–6/6) | L3 (6/6) | ✓ |
| techfix-q1 | Fake-L3 | 6 | ≤L2 (≤4/6) | L2 (4/6) | ✓ trap |
| ecowash-q1 | L1 | 6 | L1 (1–2/6) | L2 (3/6) | ~ |
| ecowash-q1 | L2 | 6 | L2 (3–4/6) | L3 (6/6) | ~ |
| ecowash-q1 | L3 | 6 | L3 (5–6/6) | L3 (6/6) | ✓ |
| ecowash-q1 | Fake-L3 | 6 | ≤L2 (≤4/6) | L2 (4/6) | ✓ trap |
| petpal-q1 | L1 | 6 | L1 (1–2/6) | L2 (4/6) | ~ |
| petpal-q1 | L2 | 6 | L2 (3–4/6) | L3 (5/6) | ~ |
| petpal-q1 | L3 | 6 | L3 (5–6/6) | L3 (6/6) | ✓ |
| petpal-q1 | Fake-L3 | 6 | ≤L2 (≤4/6) | L2 (4/6) | ✓ trap |
| cleanwave-q1 | L1 | 6 | L1 (1–2/6) | L2 (3/6) | ~ |
| cleanwave-q1 | L2 | 6 | L2 (3–4/6) | L3 (6/6) | ~ |
| cleanwave-q1 | L3 | 6 | L3 (5–6/6) | L3 (6/6) | ✓ |
| cleanwave-q1 | Fake-L3 | 6 | ≤L2 (≤4/6) | L2 (4/6) | ✓ trap |
| brightbean-q1 | L1 | 9 | L1 (1–3/9) | L1 (2/9) | ✓ |
| brightbean-q1 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| brightbean-q1 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| brightbean-q1 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| brightbean-q2 | L1 | 9 | L1 (1–3/9) | L2 (4/9) | ~ |
| brightbean-q2 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| brightbean-q2 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| brightbean-q2 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| ecoride-q1 | L1 | 9 | L1 (1–3/9) | L2 (5/9) | ~ |
| ecoride-q1 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| ecoride-q1 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| ecoride-q1 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| ecoride-q2 | L1 | 9 | L1 (1–3/9) | L2 (5/9) | ~ |
| ecoride-q2 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| ecoride-q2 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| ecoride-q2 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| urbanglide-q1 | L1 | 9 | L1 (1–3/9) | L2 (4/9) | ~ |
| urbanglide-q1 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| urbanglide-q1 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| urbanglide-q1 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| urbanglide-q2 | L1 | 9 | L1 (1–3/9) | L1 (3/9) | ✓ |
| urbanglide-q2 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| urbanglide-q2 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| urbanglide-q2 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| bytetech-q1 | L1 | 9 | L1 (1–3/9) | L2 (4/9) | ~ |
| bytetech-q1 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| bytetech-q1 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| bytetech-q1 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| bytetech-q2 | L1 | 9 | L1 (1–3/9) | L2 (4/9) | ~ |
| bytetech-q2 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| bytetech-q2 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| bytetech-q2 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| autoselect-q1 | L1 | 12 | L1 (1–4/12) | L3 (9/12) | ✗ |
| autoselect-q1 | L2 | 12 | L2 (5–8/12) | L2 (7/12) | ✓ |
| autoselect-q1 | L3 | 12 | L3 (9–10/12) | L3 (10/12) | ✓ |
| autoselect-q1 | L4 | 12 | L4 (11–12/12) | L4 (11/12) | ✓ |
| autoselect-q1 | Fake-L4 | 12 | ≤L3 (≤10/12) | L3 (10/12) | ✓ trap |
| glowcharge-q1 | L1 | 12 | L1 (1–4/12) | L2 (5/12) | ~ |
| glowcharge-q1 | L2 | 12 | L2 (5–8/12) | L3 (10/12) | ~ |
| glowcharge-q1 | L3 | 12 | L3 (9–10/12) | L3 (9/12) | ✓ |
| glowcharge-q1 | L4 | 12 | L4 (11–12/12) | L4 (12/12) | ✓ |
| glowcharge-q1 | Fake-L4 | 12 | ≤L3 (≤10/12) | L3 (10/12) | ✓ trap |
| skyview-q1 | L1 | 12 | L1 (1–4/12) | L1 (2/12) | ✓ |
| skyview-q1 | L2 | 12 | L2 (5–8/12) | L3 (10/12) | ~ |
| skyview-q1 | L3 | 12 | L3 (9–10/12) | L3 (9/12) | ✓ |
| skyview-q1 | L4 | 12 | L4 (11–12/12) | L4 (11/12) | ✓ |
| skyview-q1 | Fake-L4 | 12 | ≤L3 (≤10/12) | L2 (7/12) | ✓ trap |
| aquapure-q1 | L1 | 12 | L1 (1–4/12) | L2 (5/12) | ~ |
| aquapure-q1 | L2 | 12 | L2 (5–8/12) | L3 (9/12) | ~ |
| aquapure-q1 | L3 | 12 | L3 (9–10/12) | L3 (10/12) | ✓ |
| aquapure-q1 | L4 | 12 | L4 (11–12/12) | L4 (11/12) | ✓ |
| aquapure-q1 | Fake-L4 | 12 | ≤L3 (≤10/12) | L3 (9/12) | ✓ trap |

---

## Run: 2026-05-15 16:44 — abd18e3

**Summary**: 35/72 exact · 20 near · 0 fail · 17 traps caught · 0 traps promoted · 0 errors

| Question | Answer | Marks | Expected | Got | Status |
|---|---|---|---|---|---|
| freshblend-q1 | L1 | 4 | L1 (1–2/4) | L1 (2/4) | ✓ |
| freshblend-q1 | L2 | 4 | L2 (2–3/4) | L2 (3/4) | ✓ |
| freshblend-q1 | L3 | 4 | L3 (4–4/4) | L3 (4/4) | ✓ |
| freshblend-q1 | Fake-L3 | 4 | ≤L2 (≤3/4) | L2 (2/4) | ✓ trap |
| techfix-q1 | L1 | 6 | L1 (1–2/6) | L2 (4/6) | ~ |
| techfix-q1 | L2 | 6 | L2 (3–4/6) | L3 (6/6) | ~ |
| techfix-q1 | L3 | 6 | L3 (5–6/6) | L3 (6/6) | ✓ |
| techfix-q1 | Fake-L3 | 6 | ≤L2 (≤4/6) | L2 (4/6) | ✓ trap |
| ecowash-q1 | L1 | 6 | L1 (1–2/6) | L2 (4/6) | ~ |
| ecowash-q1 | L2 | 6 | L2 (3–4/6) | L3 (5/6) | ~ |
| ecowash-q1 | L3 | 6 | L3 (5–6/6) | L3 (6/6) | ✓ |
| ecowash-q1 | Fake-L3 | 6 | ≤L2 (≤4/6) | L2 (4/6) | ✓ trap |
| petpal-q1 | L1 | 6 | L1 (1–2/6) | L2 (4/6) | ~ |
| petpal-q1 | L2 | 6 | L2 (3–4/6) | L2 (4/6) | ✓ |
| petpal-q1 | L3 | 6 | L3 (5–6/6) | L3 (6/6) | ✓ |
| petpal-q1 | Fake-L3 | 6 | ≤L2 (≤4/6) | L2 (3/6) | ✓ trap |
| cleanwave-q1 | L1 | 6 | L1 (1–2/6) | L2 (3/6) | ~ |
| cleanwave-q1 | L2 | 6 | L2 (3–4/6) | L3 (6/6) | ~ |
| cleanwave-q1 | L3 | 6 | L3 (5–6/6) | L3 (6/6) | ✓ |
| cleanwave-q1 | Fake-L3 | 6 | ≤L2 (≤4/6) | L2 (4/6) | ✓ trap |
| brightbean-q1 | L1 | 9 | L1 (1–3/9) | L1 (2/9) | ✓ |
| brightbean-q1 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| brightbean-q1 | L3 | 9 | L3 (7–9/9) | L3 (8/9) | ✓ |
| brightbean-q1 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| brightbean-q2 | L1 | 9 | L1 (1–3/9) | L2 (4/9) | ~ |
| brightbean-q2 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| brightbean-q2 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| brightbean-q2 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| ecoride-q1 | L1 | 9 | L1 (1–3/9) | L2 (5/9) | ~ |
| ecoride-q1 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| ecoride-q1 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| ecoride-q1 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| ecoride-q2 | L1 | 9 | L1 (1–3/9) | L2 (5/9) | ~ |
| ecoride-q2 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| ecoride-q2 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| ecoride-q2 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| urbanglide-q1 | L1 | 9 | L1 (1–3/9) | L2 (4/9) | ~ |
| urbanglide-q1 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| urbanglide-q1 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| urbanglide-q1 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| urbanglide-q2 | L1 | 9 | L1 (1–3/9) | L1 (2/9) | ✓ |
| urbanglide-q2 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| urbanglide-q2 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| urbanglide-q2 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| bytetech-q1 | L1 | 9 | L1 (1–3/9) | L1 (3/9) | ✓ |
| bytetech-q1 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| bytetech-q1 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| bytetech-q1 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| bytetech-q2 | L1 | 9 | L1 (1–3/9) | L2 (5/9) | ~ |
| bytetech-q2 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| bytetech-q2 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| bytetech-q2 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| autoselect-q1 | L1 | 12 | L1 (1–4/12) | L2 (6/12) | ~ |
| autoselect-q1 | L2 | 12 | L2 (5–8/12) | L3 (9/12) | ~ |
| autoselect-q1 | L3 | 12 | L3 (9–10/12) | L3 (9/12) | ✓ |
| autoselect-q1 | L4 | 12 | L4 (11–12/12) | L4 (11/12) | ✓ |
| autoselect-q1 | Fake-L4 | 12 | ≤L3 (≤10/12) | L3 (9/12) | ✓ trap |
| glowcharge-q1 | L1 | 12 | L1 (1–4/12) | L2 (5/12) | ~ |
| glowcharge-q1 | L2 | 12 | L2 (5–8/12) | L3 (9/12) | ~ |
| glowcharge-q1 | L3 | 12 | L3 (9–10/12) | L3 (9/12) | ✓ |
| glowcharge-q1 | L4 | 12 | L4 (11–12/12) | L4 (12/12) | ✓ |
| glowcharge-q1 | Fake-L4 | 12 | ≤L3 (≤10/12) | L3 (9/12) | ✓ trap |
| skyview-q1 | L1 | 12 | L1 (1–4/12) | L2 (5/12) | ~ |
| skyview-q1 | L2 | 12 | L2 (5–8/12) | L3 (10/12) | ~ |
| skyview-q1 | L3 | 12 | L3 (9–10/12) | L3 (10/12) | ✓ |
| skyview-q1 | L4 | 12 | L4 (11–12/12) | L4 (11/12) | ✓ |
| skyview-q1 | Fake-L4 | 12 | ≤L3 (≤10/12) | L3 (10/12) | ✓ trap |
| aquapure-q1 | L1 | 12 | L1 (1–4/12) | L2 (5/12) | ~ |
| aquapure-q1 | L2 | 12 | L2 (5–8/12) | L3 (10/12) | ~ |
| aquapure-q1 | L3 | 12 | L3 (9–10/12) | L3 (9/12) | ✓ |
| aquapure-q1 | L4 | 12 | L4 (11–12/12) | L4 (12/12) | ✓ |
| aquapure-q1 | Fake-L4 | 12 | ≤L3 (≤10/12) | L2 (7/12) | ✓ trap |

---

## Run: 2026-05-15 16:30 — 7f10d55

**Summary**: 40/72 exact · 15 near · 0 fail · 17 traps caught · 0 traps promoted · 0 errors

| Question | Answer | Marks | Expected | Got | Status |
|---|---|---|---|---|---|
| freshblend-q1 | L1 | 4 | L1 (1–2/4) | L1 (1/4) | ✓ |
| freshblend-q1 | L2 | 4 | L2 (2–3/4) | L2 (3/4) | ✓ |
| freshblend-q1 | L3 | 4 | L3 (4–4/4) | L3 (4/4) | ✓ |
| freshblend-q1 | Fake-L3 | 4 | ≤L2 (≤3/4) | L2 (3/4) | ✓ trap |
| techfix-q1 | L1 | 6 | L1 (1–2/6) | L2 (3/6) | ~ |
| techfix-q1 | L2 | 6 | L2 (3–4/6) | L3 (6/6) | ~ |
| techfix-q1 | L3 | 6 | L3 (5–6/6) | L3 (6/6) | ✓ |
| techfix-q1 | Fake-L3 | 6 | ≤L2 (≤4/6) | L2 (4/6) | ✓ trap |
| ecowash-q1 | L1 | 6 | L1 (1–2/6) | L2 (3/6) | ~ |
| ecowash-q1 | L2 | 6 | L2 (3–4/6) | L2 (4/6) | ✓ |
| ecowash-q1 | L3 | 6 | L3 (5–6/6) | L3 (6/6) | ✓ |
| ecowash-q1 | Fake-L3 | 6 | ≤L2 (≤4/6) | L2 (4/6) | ✓ trap |
| petpal-q1 | L1 | 6 | L1 (1–2/6) | L2 (3/6) | ~ |
| petpal-q1 | L2 | 6 | L2 (3–4/6) | L2 (4/6) | ✓ |
| petpal-q1 | L3 | 6 | L3 (5–6/6) | L3 (6/6) | ✓ |
| petpal-q1 | Fake-L3 | 6 | ≤L2 (≤4/6) | L2 (4/6) | ✓ trap |
| cleanwave-q1 | L1 | 6 | L1 (1–2/6) | L2 (3/6) | ~ |
| cleanwave-q1 | L2 | 6 | L2 (3–4/6) | L3 (6/6) | ~ |
| cleanwave-q1 | L3 | 6 | L3 (5–6/6) | L3 (6/6) | ✓ |
| cleanwave-q1 | Fake-L3 | 6 | ≤L2 (≤4/6) | L2 (4/6) | ✓ trap |
| brightbean-q1 | L1 | 9 | L1 (1–3/9) | L1 (2/9) | ✓ |
| brightbean-q1 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| brightbean-q1 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| brightbean-q1 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| brightbean-q2 | L1 | 9 | L1 (1–3/9) | L2 (4/9) | ~ |
| brightbean-q2 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| brightbean-q2 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| brightbean-q2 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| ecoride-q1 | L1 | 9 | L1 (1–3/9) | L2 (5/9) | ~ |
| ecoride-q1 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| ecoride-q1 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| ecoride-q1 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| ecoride-q2 | L1 | 9 | L1 (1–3/9) | L1 (2/9) | ✓ |
| ecoride-q2 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| ecoride-q2 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| ecoride-q2 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| urbanglide-q1 | L1 | 9 | L1 (1–3/9) | L1 (2/9) | ✓ |
| urbanglide-q1 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| urbanglide-q1 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| urbanglide-q1 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| urbanglide-q2 | L1 | 9 | L1 (1–3/9) | L1 (3/9) | ✓ |
| urbanglide-q2 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| urbanglide-q2 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| urbanglide-q2 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| bytetech-q1 | L1 | 9 | L1 (1–3/9) | L1 (2/9) | ✓ |
| bytetech-q1 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| bytetech-q1 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| bytetech-q1 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| bytetech-q2 | L1 | 9 | L1 (1–3/9) | L2 (4/9) | ~ |
| bytetech-q2 | L2 | 9 | L2 (4–6/9) | L2 (5/9) | ✓ |
| bytetech-q2 | L3 | 9 | L3 (7–9/9) | L3 (9/9) | ✓ |
| bytetech-q2 | Fake-L3 | 9 | ≤L2 (≤5/9) | L2 (5/9) | ✓ trap |
| autoselect-q1 | L1 | 12 | L1 (1–4/12) | L2 (5/12) | ~ |
| autoselect-q1 | L2 | 12 | L2 (5–8/12) | L3 (9/12) | ~ |
| autoselect-q1 | L3 | 12 | L3 (9–10/12) | L3 (9/12) | ✓ |
| autoselect-q1 | L4 | 12 | L4 (11–12/12) | L4 (12/12) | ✓ |
| autoselect-q1 | Fake-L4 | 12 | ≤L3 (≤10/12) | L2 (7/12) | ✓ trap |
| glowcharge-q1 | L1 | 12 | L1 (1–4/12) | L2 (5/12) | ~ |
| glowcharge-q1 | L2 | 12 | L2 (5–8/12) | L2 (7/12) | ✓ |
| glowcharge-q1 | L3 | 12 | L3 (9–10/12) | L3 (9/12) | ✓ |
| glowcharge-q1 | L4 | 12 | L4 (11–12/12) | L4 (11/12) | ✓ |
| glowcharge-q1 | Fake-L4 | 12 | ≤L3 (≤10/12) | L2 (6/12) | ✓ trap |
| skyview-q1 | L1 | 12 | L1 (1–4/12) | L2 (5/12) | ~ |
| skyview-q1 | L2 | 12 | L2 (5–8/12) | L3 (9/12) | ~ |
| skyview-q1 | L3 | 12 | L3 (9–10/12) | L3 (9/12) | ✓ |
| skyview-q1 | L4 | 12 | L4 (11–12/12) | L4 (12/12) | ✓ |
| skyview-q1 | Fake-L4 | 12 | ≤L3 (≤10/12) | L2 (7/12) | ✓ trap |
| aquapure-q1 | L1 | 12 | L1 (1–4/12) | L2 (5/12) | ~ |
| aquapure-q1 | L2 | 12 | L2 (5–8/12) | L2 (7/12) | ✓ |
| aquapure-q1 | L3 | 12 | L3 (9–10/12) | L3 (9/12) | ✓ |
| aquapure-q1 | L4 | 12 | L4 (11–12/12) | L4 (12/12) | ✓ |
| aquapure-q1 | Fake-L4 | 12 | ≤L3 (≤10/12) | L3 (9/12) | ✓ trap |

---

