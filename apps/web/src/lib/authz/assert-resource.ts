import type { ResourceGrantRole } from "@mcp-gcse/db"
import {
	assertBatchAccess,
	assertExamPaperAccess,
	assertMarkSchemeAccess,
	assertPdfIngestionJobAccess,
	assertQuestionAccess,
	assertStagedScriptAccess,
	assertSubmissionAccess,
} from "./assertions"
import { AccessDeniedError, NotFoundError } from "./errors"
import type { AuthUser } from "./principal"

export type ResourceType =
	| "examPaper"
	| "submission"
	| "question"
	| "markScheme"
	| "pdfIngestionJob"
	| "batch"
	| "stagedScript"

export type ResourceRef = {
	type: ResourceType
	id: string
	role: ResourceGrantRole
}

const ASSERTERS: Record<
	ResourceType,
	(
		user: AuthUser,
		id: string,
		min: ResourceGrantRole,
	) => Promise<{ ok: true } | { ok: false; error: string }>
> = {
	examPaper: assertExamPaperAccess,
	submission: assertSubmissionAccess,
	question: assertQuestionAccess,
	markScheme: assertMarkSchemeAccess,
	pdfIngestionJob: assertPdfIngestionJobAccess,
	batch: assertBatchAccess,
	stagedScript: assertStagedScriptAccess,
}

/**
 * Assert access to a resource and throw a typed error if denied.
 *
 * The underlying assertion functions return either `{ok:true}`, `{ok:false, error:"...not found"}`,
 * or `{ok:false, error:"...access..."}`. We map "not found" messages to NotFoundError so
 * /api routes return 404, and any other failure to AccessDeniedError (403).
 */
export async function assertResource(
	user: AuthUser,
	ref: ResourceRef,
): Promise<void> {
	const result = await ASSERTERS[ref.type](user, ref.id, ref.role)
	if (result.ok) return
	if (/not found/i.test(result.error)) {
		throw new NotFoundError(result.error)
	}
	throw new AccessDeniedError(result.error)
}
