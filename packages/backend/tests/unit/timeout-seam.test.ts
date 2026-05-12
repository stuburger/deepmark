import {
	Grader,
	type LlmCallReport,
	type LlmModelEntry,
	LlmRunner,
	type LlmTimeoutMs,
	type QuestionWithMarkScheme,
} from "@mcp-gcse/shared"
import type { LanguageModel } from "ai"
import { describe, expect, it, vi } from "vitest"

// `comprehendPage` and `mapTokensToChars` ultimately import from `@/db`
// (via `llm-runtime.ts` → `llm-config.ts`), which reads SST `Resource` at
// module-load time. Stubbing the SST module lets the import graph evaluate
// without an active `sst dev` session — actual values never get used
// because we never invoke a real LLM.
vi.mock("sst", () => ({
	Resource: new Proxy(
		{},
		{
			get: () => ({
				value: "stub",
				databaseUrl: "postgres://stub",
				name: "stub",
				url: "stub",
			}),
		},
	),
}))

import { comprehendPage } from "../../src/lib/scan-extraction/comprehend-page"
import { mapTokensToChars } from "../../src/lib/scan-extraction/map-tokens-to-chars"
import { generateExaminerSummary } from "../../src/lib/grading/examiner-summary"

// ─── Why this test exists ──────────────────────────────────────────────────
//
// The bug we just fixed was a silent default to 90 s because the Lambda
// envelope never reached the LLM call. The chain has multiple forwarding
// hops:
//
//   handler → llmTimeoutFromContext → service fn → callLlmWithFallback → runner.call
//
// `llmTimeoutFromContext` is unit-tested in lambda-envelope.test.ts.
// `runner.call` honouring the thunk is unit-tested in llm-runner.test.ts.
// The middle hops — service fn passes the option through, callLlmWithFallback
// forwards it — are what a regression would silently break. TypeScript can't
// catch "field accidentally omitted from an options bag", so we need a
// runtime test.
//
// Strategy: substitute a `CapturingRunner` whose `call()` records the
// `opts.timeoutMs` it was handed and bails. Drive each service function
// with a known thunk; assert the runner sees the SAME thunk by reference.
// If any hop in the chain forgets to forward `timeoutMs`, the spy receives
// `undefined` and the test fails.

const GOOGLE_FLASH: LlmModelEntry = {
	provider: "google",
	model: "gemini-2.5-flash",
	temperature: 0.1,
}

const stubModel: LanguageModel = { modelId: "stub" } as unknown as LanguageModel

class CapturingRunner extends LlmRunner {
	public capturedTimeoutMs: LlmTimeoutMs | undefined
	public capturedCallSite: string | undefined

	override async call<T>(
		callSiteKey: string,
		fn: (
			model: LanguageModel,
			entry: LlmModelEntry,
			report: LlmCallReport,
			signal: AbortSignal,
		) => Promise<T>,
		opts?: { timeoutMs?: LlmTimeoutMs },
	): Promise<T> {
		this.capturedTimeoutMs = opts?.timeoutMs
		this.capturedCallSite = callSiteKey
		// Bail immediately — the caller's downstream work will throw, but
		// the seam we're testing has already been observed.
		throw new Error("capture-and-bail")
	}
}

function makeCapturingRunner(): CapturingRunner {
	return new CapturingRunner({
		getConfig: async () => [GOOGLE_FLASH],
		resolveModel: () => stubModel,
		logger: { warn: vi.fn(), info: vi.fn() },
	})
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("timeout-seam — service-level forwarding", () => {
	it("comprehendPage forwards timeoutMs to LlmRunner.call", async () => {
		const runner = makeCapturingRunner()
		const thunk: LlmTimeoutMs = () => 12_345

		await comprehendPage(
			"base64-image",
			"image/jpeg",
			{ timeoutMs: thunk },
			runner,
		).catch(() => {})

		expect(runner.capturedCallSite).toBe("page-comprehension")
		// Reference equality: the exact thunk we passed must reach the runner.
		// A wrapped/rebuilt thunk would imply a forwarding hop is doing work
		// it shouldn't and would mask future regressions.
		expect(runner.capturedTimeoutMs).toBe(thunk)
	})

	it("comprehendPage forwards a plain-number timeoutMs", async () => {
		const runner = makeCapturingRunner()
		await comprehendPage(
			"base64-image",
			"image/jpeg",
			{ timeoutMs: 45_000 },
			runner,
		).catch(() => {})
		expect(runner.capturedTimeoutMs).toBe(45_000)
	})

	it("comprehendPage forwards undefined when timeoutMs is omitted (runner default applies)", async () => {
		const runner = makeCapturingRunner()
		await comprehendPage(
			"base64-image",
			"image/jpeg",
			{},
			runner,
		).catch(() => {})
		expect(runner.capturedTimeoutMs).toBeUndefined()
	})

	it("mapTokensToChars forwards timeoutMs to LlmRunner.call", async () => {
		const runner = makeCapturingRunner()
		const thunk: LlmTimeoutMs = () => 67_890

		await mapTokensToChars({
			answerText: "hello world",
			tokens: [
				{
					page_order: 1,
					para_index: 0,
					line_index: 0,
					word_index: 0,
					text_raw: "hello",
				},
				{
					page_order: 1,
					para_index: 0,
					line_index: 0,
					word_index: 1,
					text_raw: "world",
				},
			],
			llm: runner,
			timeoutMs: thunk,
		}).catch(() => {})

		expect(runner.capturedCallSite).toBe("token-char-mapping")
		expect(runner.capturedTimeoutMs).toBe(thunk)
	})

	it("Grader forwards constructor-supplied timeoutMs to LlmRunner.call", async () => {
		const runner = makeCapturingRunner()
		const thunk: LlmTimeoutMs = () => 11_111

		const grader = new Grader(runner, { timeoutMs: thunk })
		const stubQuestion: QuestionWithMarkScheme = {
			id: "q1",
			questionType: "written",
			questionText: "Why?",
			topic: "test",
			rubric: "",
			totalPoints: 4,
			markPoints: [],
			markingMethod: "point_based",
		}
		await grader
			.gradeSingleResponse({ question: stubQuestion, answer: "because" })
			.catch(() => {})

		expect(runner.capturedTimeoutMs).toBe(thunk)
	})

	it("generateExaminerSummary forwards timeoutMs to LlmRunner.call", async () => {
		const runner = makeCapturingRunner()
		const thunk: LlmTimeoutMs = () => 22_222

		await generateExaminerSummary({
			gradingResults: [
				{
					_v: 1,
					question_id: "q1",
					question_number: "1",
					question_text: "Why?",
					student_answer: "because",
					awarded_score: 2,
					max_score: 4,
					llm_reasoning: "ok",
					feedback_summary: "ok",
					marking_method: "point_based",
					mark_points_results: [],
					mark_scheme_id: null,
				},
			],
			examPaperTitle: "Test Paper",
			subject: "english",
			runner,
			timeoutMs: thunk,
		})

		expect(runner.capturedCallSite).toBe("examiner-summary")
		expect(runner.capturedTimeoutMs).toBe(thunk)
	})
})
