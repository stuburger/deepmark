import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { annotateOneQuestion } from "../../src/lib/annotations/llm-annotations"
import type { PendingAnnotation } from "../../src/lib/annotations/types"
import { createLlmRunner } from "../../src/lib/infra/llm-runtime"
import { JAUFFERDEEN_Q2_FIXTURE } from "./fixtures/annotations/jaufferdeen-q2/fixture"
import { loadFixtureTokens } from "./fixtures/annotations/load-fixture"
import type { AnnotationFixtureSpec } from "./fixtures/annotations/shared-types"

/**
 * End-to-end evals for the per-question annotation LLM.
 *
 * These are NOT mocked — each fixture runs `annotateOneQuestion(...)` against
 * the real LLM with a frozen GradingResult, real OCR tokens, and the real
 * mark scheme as it would arrive in production.
 *
 * Purpose: capture a quality baseline BEFORE the planned annotation-prompt
 * rework (LLM emits `phrase` + `char_start` + `char_end` instead of token-ID
 * aliases — see `docs/build-plan-2026-05-18-annotation-llm-phrase-anchoring.md`).
 * After the rework lands, re-running these evals must hold annotation count
 * + AO/signal coverage within ±20% of the baseline numbers captured here.
 *
 * Current evals:
 *  - Eval 1: at least one annotation emitted (LLM doesn't return empty).
 *  - Eval 2: count within fixture-specified bounds.
 *  - Eval 3: every annotation has resolvable anchor token IDs.
 *  - Eval 4: every annotation has a non-empty reason.
 *  - Eval 5: every annotation's bbox is a valid 4-number array.
 *  - Eval 6: required signals (per fixture) each appear at least once.
 *  - Eval 7: required AO codes (per fixture) each appear at least once.
 *  - Eval 8 (skipped until rework): `phrase` matches
 *    `student_answer.slice(char_start, char_end)` exactly.
 *
 * Snapshot writer: dumps the emitted annotations as markdown to
 * `tests/integration/output/annotations-<fixture>.md` for human inspection.
 * Non-asserting; refreshed every run; gitignored.
 */

const FIXTURES: AnnotationFixtureSpec[] = [JAUFFERDEEN_Q2_FIXTURE]
const ANNOTATION_TIMEOUT_MS = 3 * 60_000
const OUTPUT_DIR = join(__dirname, "output")

type FixtureRun = {
	pending: PendingAnnotation[]
	tokenIdSet: Set<string>
	studentAnswer: string
}

async function writeAnnotationSnapshot(args: {
	fixture: AnnotationFixtureSpec
	pending: PendingAnnotation[]
}): Promise<void> {
	const { fixture, pending } = args
	const lines: string[] = []
	lines.push(`# Annotation snapshot — ${fixture.name}`)
	lines.push("")
	lines.push(`Generated: ${new Date().toISOString()}`)
	lines.push(`Question: ${fixture.gradingResult.question_number}`)
	lines.push(
		`Awarded: ${fixture.gradingResult.awarded_score}/${fixture.gradingResult.max_score} (${fixture.gradingResult.marking_method})`,
	)
	lines.push(`Emitted: ${pending.length} annotations`)
	lines.push("")
	lines.push("## Student answer")
	lines.push("")
	lines.push("```")
	lines.push(fixture.gradingResult.student_answer)
	lines.push("```")
	lines.push("")

	for (const [i, a] of pending.entries()) {
		const overlay = a.overlayType === "annotation" ? a.payload : null
		const signal = overlay?.signal ?? a.overlayType
		const ao = overlay?.ao_category ?? "—"
		lines.push(`## #${i + 1} — ${signal} (${a.sentiment})`)
		lines.push("")
		lines.push(`- Anchors: \`${a.anchorTokenStartId}\` → \`${a.anchorTokenEndId}\``)
		lines.push(`- AO: ${ao}${overlay?.ao_quality ? ` (${overlay.ao_quality})` : ""}`)
		lines.push(`- Bbox: \`[${a.bbox.join(", ")}]\` on page ${a.pageOrder}`)
		if (overlay?.reason) lines.push(`- Reason: ${overlay.reason}`)
		if (overlay?.comment) lines.push(`- Comment: ${overlay.comment}`)
		lines.push("")
	}

	await mkdir(OUTPUT_DIR, { recursive: true })
	await writeFile(
		join(OUTPUT_DIR, `annotations-${fixture.name}.md`),
		lines.join("\n"),
		"utf-8",
	)
}

/**
 * Stable fingerprint of an annotation set — used for repeatability checks.
 * We hash the set of (signal, anchor span, ao_category) tuples sorted by
 * span, so phrasing variation in `reason`/`comment` doesn't trigger drift.
 */
function fingerprint(pending: PendingAnnotation[]): string {
	const tuples = pending.map((a) => {
		const overlay = a.overlayType === "annotation" ? a.payload : null
		return `${overlay?.signal ?? a.overlayType}|${a.anchorTokenStartId}|${a.anchorTokenEndId}|${overlay?.ao_category ?? ""}`
	})
	tuples.sort()
	return createHash("sha1").update(tuples.join("\n")).digest("hex").slice(0, 12)
}

describe.each(FIXTURES)("annotation evals — $name", (fixture) => {
	const run: FixtureRun = {
		pending: [],
		tokenIdSet: new Set(),
		studentAnswer: fixture.gradingResult.student_answer,
	}

	beforeAll(async () => {
		const tokens = loadFixtureTokens(fixture)
		for (const t of tokens) run.tokenIdSet.add(t.id)

		const llm = createLlmRunner()
		const pending = await annotateOneQuestion({
			gradingResult: fixture.gradingResult,
			allTokens: tokens,
			examBoard: fixture.examBoard,
			subject: fixture.subject,
			levelDescriptors: fixture.levelDescriptors ?? null,
			markScheme: fixture.markScheme,
			llm,
			jobId: `eval-${fixture.name}-${Date.now()}`,
		})
		run.pending = pending

		await writeAnnotationSnapshot({ fixture, pending })

		// Print baseline metrics to the test log so they're captured in CI
		// output. Hash gives a "did this regress" signal at a glance.
		// biome-ignore lint/suspicious/noConsole: eval baseline diagnostics
		console.log(
			`[annotation-eval ${fixture.name}] count=${pending.length} fingerprint=${fingerprint(pending)}`,
		)
	}, ANNOTATION_TIMEOUT_MS)

	afterAll(() => {
		// No DB state to clean up — annotations were not persisted (eval
		// invoked the pure LLM function directly).
	})

	it("Eval 1 — LLM emits at least one annotation", () => {
		expect(
			run.pending.length,
			"LLM returned zero annotations — check prompt regression or LLM availability",
		).toBeGreaterThan(0)
	})

	it.skipIf(!fixture.expectations.annotationCount)(
		"Eval 2 — annotation count within fixture bounds",
		() => {
			const bounds = fixture.expectations.annotationCount
			if (!bounds) throw new Error("guarded by skipIf")
			expect(
				run.pending.length,
				`expected ${bounds.min}–${bounds.max} annotations; got ${run.pending.length}`,
			).toBeGreaterThanOrEqual(bounds.min)
			expect(run.pending.length).toBeLessThanOrEqual(bounds.max)
		},
	)

	it("Eval 3 — every annotation has resolvable anchor token IDs", () => {
		const unresolved = run.pending.filter(
			(a) =>
				!a.anchorTokenStartId ||
				!a.anchorTokenEndId ||
				!run.tokenIdSet.has(a.anchorTokenStartId) ||
				!run.tokenIdSet.has(a.anchorTokenEndId),
		)
		expect(
			unresolved,
			`${unresolved.length} annotation(s) have missing or invalid anchor token IDs — pipeline should have dropped them before persisting`,
		).toEqual([])
	})

	it("Eval 4 — every annotation has a non-empty reason", () => {
		const empty = run.pending.filter((a) => {
			const overlay = a.overlayType === "annotation" ? a.payload : null
			const reason = overlay?.reason ?? ""
			return reason.trim().length === 0
		})
		expect(
			empty,
			`${empty.length} annotation(s) emitted with empty reason — this is the bug 7bc53cc tightened the schema for`,
		).toEqual([])
	})

	it("Eval 5 — every annotation's bbox is a valid 4-number array", () => {
		const invalid = run.pending.filter(
			(a) =>
				!Array.isArray(a.bbox) ||
				a.bbox.length !== 4 ||
				a.bbox.some((n) => typeof n !== "number" || !Number.isFinite(n)),
		)
		expect(
			invalid,
			`${invalid.length} annotation(s) have invalid bbox shape — must be [yMin, xMin, yMax, xMax]`,
		).toEqual([])
	})

	it.skipIf(!fixture.expectations.mustHaveSignals?.length)(
		"Eval 6 — required signals each appear at least once",
		() => {
			const required = fixture.expectations.mustHaveSignals ?? []
			const seen = new Set<string>()
			for (const a of run.pending) {
				const overlay = a.overlayType === "annotation" ? a.payload : null
				if (overlay?.signal) seen.add(overlay.signal)
			}
			const missing = required.filter((s) => !seen.has(s))
			expect(
				missing,
				`required signals missing from emitted annotations: [${missing.join(", ")}] — got signals [${[...seen].join(", ")}]`,
			).toEqual([])
		},
	)

	it.skipIf(!fixture.expectations.mustHaveAoCodes?.length)(
		"Eval 7 — required AO codes each appear at least once",
		() => {
			const required = fixture.expectations.mustHaveAoCodes ?? []
			const seen = new Set<string>()
			for (const a of run.pending) {
				const overlay = a.overlayType === "annotation" ? a.payload : null
				const ao = overlay?.ao_category
				if (typeof ao === "string" && ao.length > 0) seen.add(ao)
			}
			const missing = required.filter((c) => !seen.has(c))
			expect(
				missing,
				`required AO codes missing: [${missing.join(", ")}] — got [${[...seen].join(", ")}]`,
			).toEqual([])
		},
	)

	// Eval 8 — gated until the phrase-anchoring rework lands. Once the LLM
	// emits { phrase, char_start, char_end }, this asserts:
	//   answer.slice(char_start, char_end) === phrase
	// for every emitted annotation. See
	// docs/build-plan-2026-05-18-annotation-llm-phrase-anchoring.md.
	it.skip("Eval 8 — RESERVED phrase consistency check (post-rework)", () => {
		expect(true).toBe(true)
	})
})
