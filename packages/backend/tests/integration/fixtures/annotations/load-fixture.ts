import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { TokenRow } from "@/lib/annotations/types"
import type {
	AnnotationFixtureSpec,
	AnnotationFixtureToken,
} from "./shared-types"

/**
 * Loads a fixture's `tokens.json` into the `TokenRow` shape that
 * `annotateOneQuestion` expects. Stamps each token with the fixture's
 * `question_id` since attribution would have written that in production.
 */
export function loadFixtureTokens(fixture: AnnotationFixtureSpec): TokenRow[] {
	const raw = readFileSync(join(fixture.dir, "tokens.json"), "utf-8")
	const tokens = JSON.parse(raw) as AnnotationFixtureToken[]
	return tokens.map((t) => ({
		id: t.id,
		page_order: t.page_order,
		text_raw: t.text_raw,
		text_corrected: t.text_corrected,
		bbox: t.bbox,
		question_id: fixture.gradingResult.question_id,
		answer_char_start: null,
		answer_char_end: null,
	}))
}

/**
 * Loads a fixture's `fixture.json` — the captured-from-DB LLM-facing inputs
 * (gradingResult + markScheme + paper metadata). Pairs with `loadFixtureTokens`
 * and the hand-tuned `expectations` block in the TS wrapper to compose a
 * complete `AnnotationFixtureSpec`.
 *
 * Why runtime read instead of `import x from "./fixture.json"`: the backend
 * package's tsconfig doesn't enable `resolveJsonModule`, and we don't want
 * to flip it project-wide just for fixtures.
 */
export function loadFixtureData(
	fixtureDir: string,
): Omit<AnnotationFixtureSpec, "name" | "dir" | "expectations"> {
	const raw = readFileSync(join(fixtureDir, "fixture.json"), "utf-8")
	return JSON.parse(raw) as Omit<
		AnnotationFixtureSpec,
		"name" | "dir" | "expectations"
	>
}
