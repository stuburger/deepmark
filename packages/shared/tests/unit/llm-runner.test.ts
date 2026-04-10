import type { LanguageModel } from "ai"
import { describe, expect, it, vi } from "vitest"
import { LlmRunSnapshotSchema, LlmRunner } from "../../src/llm/runner"
import type { LlmModelEntry } from "../../src/llm/types"

// ── Test helpers ────────────────────────────────────────────────────────────

function stubModel(id: string): LanguageModel {
	return { modelId: id } as unknown as LanguageModel
}

const GOOGLE_FLASH: LlmModelEntry = {
	provider: "google",
	model: "gemini-2.5-flash",
	temperature: 0.1,
}

const OPENAI_GPT4O: LlmModelEntry = {
	provider: "openai",
	model: "gpt-4o",
	temperature: 0.7,
}

function createRunner(
	config: Record<string, LlmModelEntry[]> = { grading: [GOOGLE_FLASH] },
	overrides?: Record<string, LlmModelEntry[]>,
) {
	const getConfig = vi.fn(async (key: string) => config[key] ?? [])
	const resolveModel = vi.fn((entry: LlmModelEntry) =>
		stubModel(`${entry.provider}/${entry.model}`),
	)
	const runner = new LlmRunner({ getConfig, resolveModel }, overrides)
	return { runner, getConfig, resolveModel }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("LlmRunner", () => {
	it("records selected config on call()", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })

		await runner.call("grading", async () => "result")

		const snapshot = runner.toSnapshot()
		expect(snapshot.selected.grading).toEqual([GOOGLE_FLASH])
	})

	it("records effective summary across multiple calls", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })

		await runner.call("grading", async () => "a")
		await runner.call("grading", async () => "b")

		const snapshot = runner.toSnapshot()
		expect(snapshot.effective.grading).toEqual({
			total_calls: 2,
			fallback_calls: 0,
		})
	})

	it("records fallback when primary model fails", async () => {
		const { runner } = createRunner({
			grading: [GOOGLE_FLASH, OPENAI_GPT4O],
		})

		let callCount = 0
		await runner.call("grading", async (model) => {
			callCount++
			if (
				(model as unknown as { modelId: string }).modelId.includes("google")
			) {
				throw new Error("Google failed")
			}
			return "fallback-result"
		})

		const snapshot = runner.toSnapshot()
		expect(snapshot.effective.grading).toEqual({
			total_calls: 1,
			fallback_calls: 1,
		})
		expect(callCount).toBe(2)
	})

	it("throws when all models fail", async () => {
		const { runner } = createRunner({
			grading: [GOOGLE_FLASH, OPENAI_GPT4O],
		})

		await expect(
			runner.call("grading", async () => {
				throw new Error("fail")
			}),
		).rejects.toThrow("fail")

		// No effective entry recorded
		const snapshot = runner.toSnapshot()
		expect(snapshot.effective.grading).toBeUndefined()
	})

	it("tracks multiple call sites independently", async () => {
		const { runner } = createRunner({
			grading: [GOOGLE_FLASH],
			ocr: [OPENAI_GPT4O],
		})

		await runner.call("grading", async () => "a")
		await runner.call("grading", async () => "b")
		await runner.call("ocr", async () => "c")

		const snapshot = runner.toSnapshot()
		expect(snapshot.selected.grading).toEqual([GOOGLE_FLASH])
		expect(snapshot.selected.ocr).toEqual([OPENAI_GPT4O])
		expect(snapshot.effective.grading).toEqual({
			total_calls: 2,
			fallback_calls: 0,
		})
		expect(snapshot.effective.ocr).toEqual({
			total_calls: 1,
			fallback_calls: 0,
		})
	})

	it("uses override instead of getConfig", async () => {
		const overrideConfig: LlmModelEntry[] = [OPENAI_GPT4O]
		const { runner, getConfig } = createRunner(
			{ grading: [GOOGLE_FLASH] },
			{ grading: overrideConfig },
		)

		await runner.call("grading", async () => "result")

		expect(getConfig).not.toHaveBeenCalled()
		const snapshot = runner.toSnapshot()
		expect(snapshot.selected.grading).toEqual(overrideConfig)
	})

	it("supports partial overrides — uses override for one key, getConfig for another", async () => {
		const { runner, getConfig } = createRunner(
			{ grading: [GOOGLE_FLASH], ocr: [GOOGLE_FLASH] },
			{ grading: [OPENAI_GPT4O] },
		)

		await runner.call("grading", async () => "a")
		await runner.call("ocr", async () => "b")

		// getConfig called only for "ocr", not "grading"
		expect(getConfig).toHaveBeenCalledTimes(1)
		expect(getConfig).toHaveBeenCalledWith("ocr")

		const snapshot = runner.toSnapshot()
		expect(snapshot.selected.grading).toEqual([OPENAI_GPT4O])
		expect(snapshot.selected.ocr).toEqual([GOOGLE_FLASH])
	})

	it("toSnapshot() returns Zod-valid data", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })

		await runner.call("grading", async () => "result")

		const snapshot = runner.toSnapshot()
		const parsed = LlmRunSnapshotSchema.safeParse(snapshot)
		expect(parsed.success).toBe(true)
	})

	it("toSnapshot() returns a deep clone", async () => {
		const { runner } = createRunner({ grading: [GOOGLE_FLASH] })

		await runner.call("grading", async () => "result")

		const snap1 = runner.toSnapshot()
		snap1.selected.grading = []
		snap1.effective.grading = { total_calls: 999, fallback_calls: 999 }

		const snap2 = runner.toSnapshot()
		expect(snap2.selected.grading).toEqual([GOOGLE_FLASH])
		expect(snap2.effective.grading).toEqual({
			total_calls: 1,
			fallback_calls: 0,
		})
	})
})
