import { enforcePapersQuota } from "@/lib/billing/entitlement"

import { authenticatedAction } from "./action-client"

/**
 * Action client for server actions that consume one paper of marking quota
 * — i.e. that trigger a new OCR or grading run for a single submission
 * (initial submit, re-mark, re-scan).
 *
 * For batch actions (commitBatch fans out to N papers) gate inline by
 * calling `enforcePapersQuota({ user, additionalPapers: scriptCount })`
 * after counting the staged scripts, before committing.
 *
 * Throws TrialExhaustedError on cap; handleServerError surfaces its message
 * directly so the UI can render an upgrade CTA from `result.serverError`.
 */
export const markingAction = authenticatedAction.use(async ({ next, ctx }) => {
	await enforcePapersQuota({ user: ctx.user, additionalPapers: 1 })
	return next({ ctx })
})
