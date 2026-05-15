import * as fs from "node:fs"
import * as path from "node:path"
import { Grader, LevelOfResponseMarker } from "@mcp-gcse/shared"
import type { QuestionWithMarkScheme } from "@mcp-gcse/shared"
import { describe, expect, it } from "vitest"
import { EXAMINER_SYSTEM_PROMPT } from "../../src/lib/grading/grader-config"
import { createLlmRunner } from "../../src/lib/infra/llm-runtime"
import {
	type ExemplarAnswer,
	type ExemplarQuestion,
	flattenedExemplars,
	levelBand,
	renderTemplateMarkScheme,
} from "./fixtures/lor-exemplar-bank"

/**
 * LoR Exemplar Bank — marker baseline + regression eval.
 *
 * Runs every exemplar in the bank through the LoR marker against the real
 * Gemini fallback chain. No mocks. Asserts:
 *   - Structural: predicted score in [0, totalMarks]; level in {1..topLevel}.
 *   - Level classification (non-trap): predicted Level within ±1 of expected.
 *   - Trap detection (Fake-L3/Fake-L4): predicted mark ≤ markMax (the trap
 *     ceiling). A marker that promotes a polished-but-shallow answer above
 *     its real Level fails this hard.
 *
 * Soft log: every run appends a markdown table to
 *   docs/eval-journal/lor-marker.md
 * with date, commit, predicted-mark, predicted-level, pass/fail per exemplar.
 * This is the "living continuous snapshot" — drift visible in git diff.
 *
 * Cost: ~72 LLM calls × ~$0.05 each = ~$3.50 per full run. Concurrency is
 * capped at MAX_PARALLEL to stay polite to provider rate limits.
 */

const MAX_PARALLEL = 8
const PER_EXEMPLAR_TIMEOUT_MS = 90_000
const SUITE_TIMEOUT_MS = 25 * 60_000

const JOURNAL_PATH = path.resolve(
	__dirname,
	"../../../../docs/eval-journal/lor-marker.md",
)

type ExemplarResult = {
	question: ExemplarQuestion
	answer: ExemplarAnswer
	predicted: {
		totalScore: number
		levelAwarded: number
		feedbackSummary: string
		whyNotNextLevel: string
	} | null
	error: string | null
	durationMs: number
}

function buildQuestion(q: ExemplarQuestion): QuestionWithMarkScheme {
	return {
		id: q.id,
		questionType: "written",
		questionText: q.questionText,
		topic: "business",
		rubric: q.commandWord,
		totalPoints: q.totalMarks,
		markPoints: [],
		markingMethod: "level_of_response",
		content: renderTemplateMarkScheme(q.templateKey, q.indicativeContent),
		guidance: `Context: ${q.businessName} — ${q.businessContext}`,
	}
}

async function gradeOneExemplar(
	marker: LevelOfResponseMarker,
	question: ExemplarQuestion,
	answer: ExemplarAnswer,
): Promise<ExemplarResult> {
	const start = Date.now()
	const built = buildQuestion(question)
	try {
		const grade = await marker.mark(built, answer.text)
		return {
			question,
			answer,
			predicted: {
				totalScore: grade.totalScore,
				levelAwarded: grade.levelAwarded,
				feedbackSummary: grade.feedbackSummary,
				whyNotNextLevel: grade.whyNotNextLevel,
			},
			error: null,
			durationMs: Date.now() - start,
		}
	} catch (err) {
		return {
			question,
			answer,
			predicted: null,
			error: err instanceof Error ? err.message : String(err),
			durationMs: Date.now() - start,
		}
	}
}

async function runConcurrently<T, R>(
	items: T[],
	fn: (t: T) => Promise<R>,
	limit: number,
): Promise<R[]> {
	const out: R[] = new Array(items.length)
	let next = 0
	const workers: Promise<void>[] = []
	for (let i = 0; i < limit; i++) {
		workers.push(
			(async () => {
				while (true) {
					const idx = next++
					if (idx >= items.length) return
					const item = items[idx]
					if (item === undefined) continue
					out[idx] = await fn(item)
				}
			})(),
		)
	}
	await Promise.all(workers)
	return out
}

function gitCommit(): string {
	try {
		// biome-ignore lint: read-only sync access used in test scaffolding only
		const { execSync } = require("node:child_process") as typeof import(
			"node:child_process",
		)
		return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim()
	} catch {
		return "unknown"
	}
}

function levelStatus(
	result: ExemplarResult,
): "pass" | "near" | "fail" | "trap-pass" | "trap-fail" | "error" {
	if (result.predicted === null) return "error"
	const { expected } = result.answer
	const { totalScore, levelAwarded } = result.predicted
	if (expected.isTrap) {
		return totalScore <= expected.markMax ? "trap-pass" : "trap-fail"
	}
	const delta = Math.abs(levelAwarded - expected.level)
	if (delta === 0) return "pass"
	if (delta === 1) return "near"
	return "fail"
}

function statusGlyph(s: ReturnType<typeof levelStatus>): string {
	switch (s) {
		case "pass":
			return "✓"
		case "near":
			return "~"
		case "fail":
			return "✗"
		case "trap-pass":
			return "✓ trap"
		case "trap-fail":
			return "✗ trap"
		case "error":
			return "ERR"
	}
}

function appendJournal(results: ExemplarResult[]): void {
	const dir = path.dirname(JOURNAL_PATH)
	fs.mkdirSync(dir, { recursive: true })

	const now = new Date().toISOString().replace("T", " ").slice(0, 16)
	const commit = gitCommit()
	const total = results.length
	const counts = {
		pass: 0,
		near: 0,
		fail: 0,
		"trap-pass": 0,
		"trap-fail": 0,
		error: 0,
	}
	for (const r of results) counts[levelStatus(r)]++

	const lines: string[] = []
	if (!fs.existsSync(JOURNAL_PATH)) {
		lines.push(
			"# LoR Marker Eval Journal",
			"",
			"Append-only log of LoR marker performance against the Exemplar Reference Bank.",
			"Each section is one eval run. New runs are prepended. Drift over time shows up",
			"as a row-by-row diff against the previous run.",
			"",
			"Glyphs: ✓ exact Level match · ~ ±1 Level · ✗ Level off by 2+ · ✓ trap / ✗ trap (Fake-L3/L4 → must NOT exceed Level cap) · ERR runtime failure.",
			"",
			"---",
			"",
		)
	}
	lines.push(
		`## Run: ${now} — ${commit}`,
		"",
		`**Summary**: ${counts.pass}/${total} exact · ${counts.near} near · ${counts.fail} fail · ${counts["trap-pass"]} traps caught · ${counts["trap-fail"]} traps promoted · ${counts.error} errors`,
		"",
		"| Question | Answer | Marks | Expected | Got | Status |",
		"|---|---|---|---|---|---|",
	)
	for (const r of results) {
		const { question, answer } = r
		const expectedStr = answer.expected.isTrap
			? `≤L${answer.expected.level} (≤${answer.expected.markMax}/${question.totalMarks})`
			: `L${answer.expected.level} (${answer.expected.markMin}–${answer.expected.markMax}/${question.totalMarks})`
		const gotStr = r.predicted
			? `L${r.predicted.levelAwarded} (${r.predicted.totalScore}/${question.totalMarks})`
			: `ERR: ${r.error ?? "unknown"}`
		const status = statusGlyph(levelStatus(r))
		lines.push(
			`| ${question.id} | ${answer.id} | ${question.totalMarks} | ${expectedStr} | ${gotStr} | ${status} |`,
		)
	}
	lines.push("", "---", "")

	// Prepend so newest run is at the top of the file (after header if new).
	const existing = fs.existsSync(JOURNAL_PATH)
		? fs.readFileSync(JOURNAL_PATH, "utf8")
		: ""
	if (existing.startsWith("# LoR Marker Eval Journal")) {
		const headerEnd = existing.indexOf("---\n\n") + "---\n\n".length
		const before = existing.slice(0, headerEnd)
		const after = existing.slice(headerEnd)
		fs.writeFileSync(JOURNAL_PATH, `${before}${lines.join("\n")}\n${after}`)
	} else {
		fs.writeFileSync(JOURNAL_PATH, `${lines.join("\n")}\n`)
	}
}

describe("LoR marker — Exemplar Reference Bank", () => {
	it(
		"grades every exemplar; structural valid; non-traps within ±1 Level; traps stay capped",
		async () => {
			const llm = createLlmRunner()
			const grader = new Grader(llm, {
				systemPrompt: EXAMINER_SYSTEM_PROMPT,
				timeoutMs: PER_EXEMPLAR_TIMEOUT_MS,
			})
			const marker = new LevelOfResponseMarker(grader)

			const flat = flattenedExemplars()
			const results = await runConcurrently(
				flat,
				({ question, answerIndex }) => {
					const answer = question.answers[answerIndex]
					if (!answer) throw new Error("answerIndex out of range")
					return gradeOneExemplar(marker, question, answer)
				},
				MAX_PARALLEL,
			)

			appendJournal(results)

			// ── Hard assertions ─────────────────────────────────────────────
			const errors: string[] = []
			const trapFails: string[] = []
			const levelFails: string[] = []
			const structuralFails: string[] = []

			for (const r of results) {
				const label = `${r.question.id}/${r.answer.id}`
				if (r.error || r.predicted === null) {
					errors.push(`${label}: ${r.error ?? "no predicted result"}`)
					continue
				}
				const { totalScore, levelAwarded } = r.predicted

				if (totalScore < 0 || totalScore > r.question.totalMarks) {
					structuralFails.push(
						`${label}: totalScore ${totalScore} outside [0, ${r.question.totalMarks}]`,
					)
				}
				const topLevel = r.question.totalMarks >= 12 ? 4 : 3
				if (levelAwarded < 1 || levelAwarded > topLevel) {
					structuralFails.push(
						`${label}: levelAwarded ${levelAwarded} outside [1, ${topLevel}]`,
					)
				}

				if (r.answer.expected.isTrap) {
					if (totalScore > r.answer.expected.markMax) {
						trapFails.push(
							`${label}: trap promoted — got ${totalScore}, must be ≤ ${r.answer.expected.markMax}. Predicted L${levelAwarded}; expected ≤ L${r.answer.expected.level}.`,
						)
					}
				} else {
					const delta = Math.abs(levelAwarded - r.answer.expected.level)
					if (delta > 1) {
						const band = levelBand(
							r.question.templateKey,
							r.answer.expected.level,
						)
						levelFails.push(
							`${label}: predicted L${levelAwarded} (${totalScore}/${r.question.totalMarks}); expected L${r.answer.expected.level}${band ? ` (${band.min}–${band.max})` : ""}. Δ=${delta}.`,
						)
					}
				}
			}

			const summaryMsg = [
				`Exemplars: ${results.length}`,
				`Errors: ${errors.length}`,
				`Structural fails: ${structuralFails.length}`,
				`Level fails (|Δ|≥2): ${levelFails.length}`,
				`Trap fails: ${trapFails.length}`,
				...(errors.length
					? ["", "Errors:", ...errors.map((e) => `  ${e}`)]
					: []),
				...(structuralFails.length
					? ["", "Structural fails:", ...structuralFails.map((s) => `  ${s}`)]
					: []),
				...(levelFails.length
					? ["", "Level fails:", ...levelFails.map((l) => `  ${l}`)]
					: []),
				...(trapFails.length
					? ["", "Trap fails:", ...trapFails.map((t) => `  ${t}`)]
					: []),
			].join("\n")

			// Always log a one-line summary regardless of pass/fail.
			console.log(`\n${summaryMsg}\n`)

			expect(
				structuralFails.length,
				`Structural failures should be 0:\n${summaryMsg}`,
			).toBe(0)
			expect(
				trapFails.length,
				`Trap promotions should be 0 (a marker that promotes Fake-L3/L4 is broken):\n${summaryMsg}`,
			).toBe(0)
			expect(
				levelFails.length,
				`Level mis-classifications (|Δ|≥2) should be 0:\n${summaryMsg}`,
			).toBe(0)
			// Errors are softer — they indicate infra problems, not marker problems.
			expect(
				errors.length,
				`Runtime errors:\n${summaryMsg}`,
			).toBeLessThanOrEqual(2)
		},
		SUITE_TIMEOUT_MS,
	)
})
