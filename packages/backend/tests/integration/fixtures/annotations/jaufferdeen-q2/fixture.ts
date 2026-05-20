import { join } from "node:path"
import { loadFixtureData } from "../load-fixture"
import type { AnnotationFixtureSpec } from "../shared-types"

/**
 * Jaufferdeen A — Pearson English Lang P1, Question 2.
 *
 * Question type: point_based (2 marks, 7 possible mark points). The student
 * answered correctly and was awarded 2/2 — both their points anchored on
 * verbatim quotes ("most lovingly", "wept") that match canonical mark points.
 *
 * Why this fixture: shortest real point_based answer we have. Lets the eval
 * scaffolding run in seconds against the actual LLM without burning budget.
 * Mark scheme has 7 quotable points but only 2 needed to score — annotation
 * LLM should produce ~2 ticks (one per awarded point) plus optionally an
 * underline on the quoted evidence.
 *
 * Source data lives in `fixture.json` — captured via
 * `bun packages/backend/scripts/fixturise.ts` so it survives DB resets and is
 * trivially regenerable. Expectations below are hand-tuned.
 */
export const JAUFFERDEEN_Q2_FIXTURE: AnnotationFixtureSpec = {
	name: "jaufferdeen-q2",
	dir: join(__dirname),
	...loadFixtureData(__dirname),
	expectations: {
		annotationCount: { min: 1, max: 6 },
		// AO1 may or may not be tagged for point_based; the prompt allows it
		// but doesn't require it. Leaving `mustHaveAoCodes` unset.
		mustHaveSignals: ["tick"],
	},
}
