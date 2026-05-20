import { join } from "node:path"
import { loadFixtureData } from "../load-fixture"
import type { AnnotationFixtureSpec } from "../shared-types"

/**
 * daso-q024-jit — AQA GCSE Business Studies, Q02.4 (LoR, 9 marks, scored 4/9).
 *
 * Question: "D@SO Ltd has set an aim of increasing profits. Recommend whether
 * D@SO Ltd should introduce just-in-time (JIT) stock control. Give reasons
 * for your recommendation."
 *
 * Why this fixture: first Business Studies fixture in the suite — proves the
 * annotation pipeline generalises beyond English. LoR at Level 2 with a
 * single "Overall" AO and a 3-met / 3-unmet descriptor split, which gives
 * the annotation LLM clear positive AND negative signals to anchor on. WWW
 * and EBI are both populated, so the eval can assert per-list anchor
 * coverage when we want to tighten.
 *
 * Source data lives in `fixture.json` — captured via
 * `bun packages/backend/scripts/fixturise.ts` so it survives DB resets.
 * Expectations below are hand-tuned.
 */
export const DASO_Q024_JIT_FIXTURE: AnnotationFixtureSpec = {
	name: "daso-q024-jit",
	dir: join(__dirname),
	...loadFixtureData(__dirname),
	expectations: {
		// LoR with one AO at Level 2 and a 3-met/3-unmet descriptor split.
		// Expect at least one positive (tick) and at least one critical (cross),
		// generous upper bound while we capture a baseline.
		annotationCount: { min: 2, max: 14 },
		mustHaveSignals: ["tick", "cross"],
	},
}
