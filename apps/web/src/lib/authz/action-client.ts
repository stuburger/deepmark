import type { ResourceGrantRole } from "@mcp-gcse/db"
import { createSafeActionClient } from "next-safe-action"
import type { z } from "zod"
import { handleServerError } from "./handle-server-error"
import {
	type AccessWhereResult,
	type AccessWhereScope,
	resolveAccessWhere,
} from "./middleware/attach-access-where"
import { type Logger, buildLogger } from "./middleware/attach-logger"
import { requireAdminUser } from "./middleware/require-admin"
import {
	type ResourceSpec,
	type SingleResourceSpec,
	assertSpecAccess,
} from "./middleware/require-resource"
import { resolveSessionUser } from "./middleware/require-session"
import type { AuthUser } from "./principal"

/**
 * The six action clients. All actions in `"use server"` modules MUST be built
 * from one of these — this is enforced by an ESLint rule. Each client extends
 * the next-safe-action chain with the right combination of session resolution,
 * resource access checks, and contextual logging.
 *
 *  - publicAction       — no session required (login, logout, public callbacks).
 *  - authenticatedAction — requires session; ctx is { user, log }.
 *  - adminAction        — authenticated + systemRole === "admin".
 *  - resourceAction()   — authenticated + asserts a single resource role.
 *  - resourcesAction()  — authenticated + asserts a list of resource roles.
 *  - scopedAction()     — authenticated + computes a Prisma where-clause for list queries.
 *
 * The factory variants (resourceAction/resourcesAction/scopedAction) accept an
 * input schema and a per-action spec because the resource id has to be resolved
 * from the typed input — putting that resolver in metadata would lose typing.
 */

const baseClient = createSafeActionClient({
	handleServerError,
	defaultValidationErrorsShape: "flattened",
})

export const publicAction = baseClient.use(async ({ next }) => {
	return next({ ctx: { log: buildLogger("public-action", "anonymous") } })
})

export const authenticatedAction = baseClient.use(async ({ next }) => {
	const user = await resolveSessionUser()
	const log = buildLogger("authenticated-action", user.id)
	return next({ ctx: { user, log } })
})

export const adminAction = authenticatedAction.use(async ({ next, ctx }) => {
	requireAdminUser(ctx.user)
	return next({ ctx })
})

// ─── Factory clients ──────────────────────────────────────────────────────────

type ResourceActionSpec<TInput> = SingleResourceSpec<TInput> & {
	schema: z.ZodType<TInput>
}

/**
 * Build an action client that asserts the calling user has at least `role` on
 * the resource identified by `id(parsedInput)`. Equivalent to
 * authenticatedAction with input validation + a single-resource access check.
 */
export function resourceAction<TInput>(spec: ResourceActionSpec<TInput>) {
	return authenticatedAction
		.inputSchema(spec.schema)
		.useValidated(async ({ next, parsedInput, ctx }) => {
			await assertSpecAccess<TInput, typeof spec.schema>(
				ctx.user,
				[{ type: spec.type, role: spec.role, id: spec.id }],
				parsedInput as TInput,
			)
			return next({ ctx })
		})
}

type ResourcesActionSpec<TInput> = {
	schema: z.ZodType<TInput>
	resources: ResourceSpec<TInput>[]
}

/**
 * Like resourceAction but for actions that touch multiple resources — e.g.
 * consolidating two questions, sharing a list of submissions.
 */
export function resourcesAction<TInput>(spec: ResourcesActionSpec<TInput>) {
	return authenticatedAction
		.inputSchema(spec.schema)
		.useValidated(async ({ next, parsedInput, ctx }) => {
			await assertSpecAccess<TInput, typeof spec.schema>(
				ctx.user,
				spec.resources,
				parsedInput as TInput,
			)
			return next({ ctx })
		})
}

type ScopedActionSpec<S extends AccessWhereScope> = {
	scope: S
	role: ResourceGrantRole
}

/**
 * Build an action client for a list query that should be filtered by the
 * caller's effective access. The action handler reads `ctx.accessWhere` and
 * passes it as a `where` clause to Prisma. Chain `.inputSchema(...)` if the
 * list takes filter args.
 */
export function scopedAction<S extends AccessWhereScope>(
	spec: ScopedActionSpec<S>,
) {
	return authenticatedAction.use(async ({ next, ctx }) => {
		const accessWhere = await resolveAccessWhere(
			ctx.user,
			spec.scope,
			spec.role,
		)
		return next({ ctx: { ...ctx, accessWhere } })
	})
}

export type AuthenticatedCtx = { user: AuthUser; log: Logger }
export type ScopedCtx<S extends AccessWhereScope> = AuthenticatedCtx & {
	accessWhere: AccessWhereResult[S]
}
