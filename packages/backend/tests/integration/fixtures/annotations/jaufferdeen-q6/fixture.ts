import { join } from "node:path"
import { loadFixtureData } from "../load-fixture"
import type { AnnotationFixtureSpec } from "../shared-types"

/**
 * Jaufferdeen A — Pearson English Lang P1, Question 6 (creative writing).
 *
 * Question type: level_of_response (AO5 24m + AO6 16m, 40m total). The
 * student wrote a short narrative about a journey to a 50th birthday;
 * awarded 13/40 (Level 2 on both AOs).
 *
 * Why this fixture: the canonical LoR test case for annotation. AO awards
 * with descriptor_evaluations are the prompt's primary anchor signal — the
 * LLM should produce per-descriptor annotations (positive on met,
 * negative on not-met) with evidence quoted verbatim from the student
 * answer.
 *
 * Source data lives in `fixture.json` — captured via
 * `bun packages/backend/scripts/fixturise.ts` so it survives DB resets and is
 * trivially regenerable. Expectations below are hand-tuned.
 */
export const JAUFFERDEEN_Q6_FIXTURE: AnnotationFixtureSpec = {
	name: "jaufferdeen-q6",
	dir: join(__dirname),
	...loadFixtureData(__dirname),
	expectations: {
		// LoR with two AOs at Level 2 — the prompt should anchor at least one
		// positive annotation per AO (descriptors met) and at least one
		// negative annotation per AO (descriptors not met at the next level).
		// Generous upper bound while we capture baseline; tighten after a few runs.
		annotationCount: { min: 4, max: 20 },
		mustHaveAoCodes: ["AO5", "AO6"],
		// Expect at least one positive (tick / underline) and at least one
		// critical (cross / box) — LoR with mixed met/not-met descriptors.
		mustHaveSignals: ["tick", "cross"],
	},
}
