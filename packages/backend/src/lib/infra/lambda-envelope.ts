import type { LlmTimeoutMs } from "@mcp-gcse/shared"
import type { Context } from "aws-lambda"

/**
 * Reserve this much wall-clock so the handler can catch the timeout error,
 * mark the job as failed in Postgres, and return a batchItemFailure to SQS
 * before the Lambda runtime kills the invocation. 10 s is generous for the
 * single-row update + return that follows an LLM timeout; per-call-site
 * overrides via `getTimeoutMs(headroom)` if anything proves tight.
 */
const DEFAULT_HEADROOM_MS = 10_000

/**
 * Floor for the per-attempt LLM budget. Below ~5 s a Gemini structured-output
 * call has effectively no chance of completing; we'd rather fail-fast and let
 * the DLQ pick the message up than burn API spend on a doomed call. The runner
 * surfaces the timeout as `LlmTimeoutError`, identical to the existing path.
 */
const MIN_BUDGET_MS = 5_000

/**
 * Wraps `context.getRemainingTimeInMillis` from an SQS Lambda invocation as a
 * domain object: "I'm running inside a Lambda with a known remaining-time
 * probe." Lets handlers thread the Lambda execution envelope through to LLM
 * call sites without leaking `aws-lambda` types into the shared marking
 * engine or service layers.
 *
 * Why a method (not a frozen number): the fallback chain may retry, and the
 * second attempt needs a smaller budget than the first. `getTimeoutMs` re-reads
 * the Lambda probe on every call, so passing
 * `() => envelope.getTimeoutMs()` to `LlmRunner.call` (which evaluates the
 * thunk per attempt) gives each attempt a fresh, accurate budget.
 */
export interface LambdaEnvelope {
	/**
	 * Returns the remaining LLM wall-clock budget in milliseconds.
	 * Clamped to `MIN_BUDGET_MS` so a near-exhausted Lambda still produces
	 * a real (if short) attempt rather than a negative timeout.
	 *
	 * @param headroomMs reserve for post-call work before Lambda shutdown.
	 *   Defaults to 10 s.
	 */
	getTimeoutMs(headroomMs?: number): number
}

/**
 * Construct an envelope from the AWS Lambda `Context`. Returns `undefined`
 * when called without a context (web server actions, unit tests, anywhere
 * outside an SQS Lambda) — callers should treat that as "use runner default".
 */
export function lambdaEnvelopeFrom(
	context: Pick<Context, "getRemainingTimeInMillis"> | undefined,
): LambdaEnvelope | undefined {
	if (!context) return undefined
	return {
		getTimeoutMs(headroomMs = DEFAULT_HEADROOM_MS) {
			const remaining = context.getRemainingTimeInMillis()
			return Math.max(MIN_BUDGET_MS, remaining - headroomMs)
		},
	}
}

/**
 * Handler convenience: build the `LlmTimeoutMs` thunk for an SQS Lambda
 * directly from its `Context`. Returns `undefined` outside Lambda so
 * downstream callees fall back to the runner default.
 *
 * The single-line replacement for the 4-line envelope→thunk dance that
 * every SQS handler used to repeat verbatim. Putting it here (rather than
 * inlining at each handler) means the typo class "wrong field name on the
 * envelope" can only happen in one place, not five.
 */
export function llmTimeoutFromContext(
	context: Pick<Context, "getRemainingTimeInMillis"> | undefined,
): LlmTimeoutMs | undefined {
	const envelope = lambdaEnvelopeFrom(context)
	return envelope ? () => envelope.getTimeoutMs() : undefined
}
