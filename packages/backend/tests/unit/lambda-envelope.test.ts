import { describe, expect, it, vi } from "vitest"

import {
	lambdaEnvelopeFrom,
	llmTimeoutFromContext,
} from "../../src/lib/infra/lambda-envelope"

const MIN_BUDGET_MS = 5_000
const DEFAULT_HEADROOM_MS = 10_000

describe("lambdaEnvelopeFrom", () => {
	it("returns undefined when context is undefined", () => {
		expect(lambdaEnvelopeFrom(undefined)).toBeUndefined()
	})

	it("returns the remaining time minus default headroom", () => {
		const envelope = lambdaEnvelopeFrom({
			getRemainingTimeInMillis: () => 300_000,
		})
		expect(envelope?.getTimeoutMs()).toBe(300_000 - DEFAULT_HEADROOM_MS)
	})

	it("honours a caller-supplied headroom override", () => {
		const envelope = lambdaEnvelopeFrom({
			getRemainingTimeInMillis: () => 60_000,
		})
		expect(envelope?.getTimeoutMs(5_000)).toBe(55_000)
	})

	it("clamps to MIN_BUDGET_MS when remaining is below headroom", () => {
		const envelope = lambdaEnvelopeFrom({
			getRemainingTimeInMillis: () => 8_000,
		})
		// 8 000 - 10 000 = -2 000 → clamp to MIN_BUDGET_MS
		expect(envelope?.getTimeoutMs()).toBe(MIN_BUDGET_MS)
	})

	it("clamps to MIN_BUDGET_MS when remaining is zero or negative", () => {
		const envelope = lambdaEnvelopeFrom({
			getRemainingTimeInMillis: () => 0,
		})
		expect(envelope?.getTimeoutMs()).toBe(MIN_BUDGET_MS)
	})

	it("llmTimeoutFromContext returns undefined outside Lambda", () => {
		expect(llmTimeoutFromContext(undefined)).toBeUndefined()
	})

	it("llmTimeoutFromContext returns a thunk that re-reads the probe", () => {
		const probe = vi
			.fn<() => number>()
			.mockReturnValueOnce(120_000)
			.mockReturnValueOnce(40_000)
		const thunk = llmTimeoutFromContext({ getRemainingTimeInMillis: probe })

		expect(typeof thunk).toBe("function")
		expect((thunk as () => number)()).toBe(110_000)
		expect((thunk as () => number)()).toBe(30_000)
		expect(probe).toHaveBeenCalledTimes(2)
	})

	it("re-reads the remaining-time probe on every call", () => {
		// Mid-flight: the Lambda has burned wall-clock between attempts. The
		// envelope MUST surface a smaller budget on the second call so the
		// fallback chain sees an accurate window.
		const probe = vi
			.fn<() => number>()
			.mockReturnValueOnce(300_000)
			.mockReturnValueOnce(120_000)
			.mockReturnValueOnce(40_000)
		const envelope = lambdaEnvelopeFrom({ getRemainingTimeInMillis: probe })

		expect(envelope?.getTimeoutMs()).toBe(290_000)
		expect(envelope?.getTimeoutMs()).toBe(110_000)
		expect(envelope?.getTimeoutMs()).toBe(30_000)
		expect(probe).toHaveBeenCalledTimes(3)
	})
})
