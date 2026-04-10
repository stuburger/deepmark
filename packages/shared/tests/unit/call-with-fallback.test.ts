import type { LanguageModel } from "ai"
import { describe, expect, it, vi } from "vitest"
import { callWithFallback } from "../../src/llm/fallback"
import type { LlmModelEntry } from "../../src/llm/types"

function stubModel(id: string): LanguageModel {
	return { modelId: id } as unknown as LanguageModel
}

const ENTRY_A: LlmModelEntry = {
	provider: "google",
	model: "gemini-2.5-flash",
	temperature: 0.1,
}

const ENTRY_B: LlmModelEntry = {
	provider: "openai",
	model: "gpt-4o",
	temperature: 0.7,
}

const resolveModel = (entry: LlmModelEntry) =>
	stubModel(`${entry.provider}/${entry.model}`)

describe("callWithFallback onEffective", () => {
	it("calls onEffective with primary entry on success", async () => {
		const onEffective = vi.fn()

		await callWithFallback([ENTRY_A], resolveModel, async () => "ok", {
			onEffective,
		})

		expect(onEffective).toHaveBeenCalledOnce()
		expect(onEffective).toHaveBeenCalledWith(ENTRY_A, 0)
	})

	it("calls onEffective with fallback entry when primary fails", async () => {
		const onEffective = vi.fn()
		let attempt = 0

		await callWithFallback(
			[ENTRY_A, ENTRY_B],
			resolveModel,
			async () => {
				attempt++
				if (attempt === 1) throw new Error("primary failed")
				return "fallback-ok"
			},
			{ onEffective },
		)

		expect(onEffective).toHaveBeenCalledOnce()
		expect(onEffective).toHaveBeenCalledWith(ENTRY_B, 1)
	})

	it("does not call onEffective when all models fail", async () => {
		const onEffective = vi.fn()

		await expect(
			callWithFallback(
				[ENTRY_A, ENTRY_B],
				resolveModel,
				async () => {
					throw new Error("fail")
				},
				{ onEffective },
			),
		).rejects.toThrow("fail")

		expect(onEffective).not.toHaveBeenCalled()
	})

	it("works without onEffective callback (backward compat)", async () => {
		const result = await callWithFallback(
			[ENTRY_A],
			resolveModel,
			async () => "result",
		)

		expect(result).toBe("result")
	})
})
