// Public surface for authz. External callers should import from here.

export { type AuthUser, normaliseEmail } from "./principal"
export {
	effectiveExamPaperRole,
	effectiveSubmissionRole,
	loadAuthUser,
	loadResourceGrants,
} from "./effective-roles"
export {
	assertBatchAccess,
	assertExamPaperAccess,
	assertMarkSchemeAccess,
	assertPdfIngestionJobAccess,
	assertQuestionAccess,
	assertStagedScriptAccess,
	assertSubmissionAccess,
	examPaperIdForQuestion,
} from "./assertions"
export {
	directlyGrantedSubmissionIdsForUser,
	examPaperAccessWhere,
	grantedResourceIds,
	readableExamPaperIdsForUser,
	submissionAccessWhere,
} from "./where-clauses"
export { maxGrantRole, meetsMinimum, roleRank, rolesAtLeast } from "./roles"
export { requireSessionUser } from "./with-session"

// next-safe-action surface
export {
	adminAction,
	authenticatedAction,
	publicAction,
	resourceAction,
	resourcesAction,
	scopedAction,
	type AuthenticatedCtx,
	type ScopedCtx,
} from "./action-client"
export { routeHandler } from "./route-handler"
export {
	AccessDeniedError,
	AuthRequiredError,
	NotFoundError,
	isAuthzError,
} from "./errors"
export type { ResourceRef, ResourceType } from "./assert-resource"
export { assertResource } from "./assert-resource"
