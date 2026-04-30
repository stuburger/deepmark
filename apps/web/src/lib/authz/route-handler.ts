import type { NextRequest } from "next/server"
import {
	AccessDeniedError,
	AuthRequiredError,
	NotFoundError,
	isAuthzError,
} from "./errors"
import { type Logger, buildLogger } from "./middleware/attach-logger"
import { requireAdminUser } from "./middleware/require-admin"
import {
	type SingleResourceSpec,
	assertSpecAccess,
} from "./middleware/require-resource"
import { resolveSessionUser } from "./middleware/require-session"
import type { AuthUser } from "./principal"

type RouteParams<P> = { params: Promise<P> }

type PublicRouteCtx = { log: Logger }
type AuthRouteCtx = { user: AuthUser; log: Logger }

type Handler<TCtx, P, TResp = Response> = (
	ctx: TCtx,
	req: NextRequest,
	args: RouteParams<P>,
) => Promise<TResp>

/**
 * Mirrors the action-client wrappers but for Next.js /api route handlers.
 *
 *   export const GET = routeHandler.resource(
 *     { type: "submission", role: "viewer", id: async (req, { params }) => (await params).jobId },
 *     async (ctx, req, { params }) => { ... }
 *   )
 *
 * Reuses resolveSessionUser and assertSpecAccess so the auth model is identical
 * to the action client. Typed errors thrown by middleware become HTTP responses.
 */

function authzErrorToResponse(err: unknown): Response | null {
	if (err instanceof AuthRequiredError) {
		return new Response("Unauthorized", { status: 401 })
	}
	if (err instanceof NotFoundError) {
		return new Response("Not found", { status: 404 })
	}
	if (err instanceof AccessDeniedError) {
		return new Response("Forbidden", { status: 403 })
	}
	if (isAuthzError(err)) {
		return new Response(err.message, { status: err.httpStatus })
	}
	return null
}

export const routeHandler = {
	public<P>(handler: Handler<PublicRouteCtx, P>) {
		return async (
			req: NextRequest,
			args: RouteParams<P>,
		): Promise<Response> => {
			const log = buildLogger("public-route", "anonymous")
			try {
				return await handler({ log }, req, args)
			} catch (err) {
				const resp = authzErrorToResponse(err)
				if (resp) return resp
				throw err
			}
		}
	},

	authenticated<P>(handler: Handler<AuthRouteCtx, P>) {
		return async (
			req: NextRequest,
			args: RouteParams<P>,
		): Promise<Response> => {
			try {
				const user = await resolveSessionUser()
				const log = buildLogger("authenticated-route", user.id)
				return await handler({ user, log }, req, args)
			} catch (err) {
				const resp = authzErrorToResponse(err)
				if (resp) return resp
				throw err
			}
		}
	},

	admin<P>(handler: Handler<AuthRouteCtx, P>) {
		return async (
			req: NextRequest,
			args: RouteParams<P>,
		): Promise<Response> => {
			try {
				const user = await resolveSessionUser()
				requireAdminUser(user)
				const log = buildLogger("admin-route", user.id)
				return await handler({ user, log }, req, args)
			} catch (err) {
				const resp = authzErrorToResponse(err)
				if (resp) return resp
				throw err
			}
		}
	},

	/**
	 * Resource-bound route. The `id` resolver runs against the resolved params
	 * (and may use the request) so dynamic segments map cleanly to resource ids.
	 */
	resource<P>(
		spec: Omit<SingleResourceSpec<{ req: NextRequest; params: P }>, "id"> & {
			id: (req: NextRequest, args: { params: P }) => Promise<string> | string
		},
		handler: Handler<AuthRouteCtx, P>,
	) {
		return async (
			req: NextRequest,
			args: RouteParams<P>,
		): Promise<Response> => {
			try {
				const user = await resolveSessionUser()
				const params = await args.params
				const id = await spec.id(req, { params })
				await assertSpecAccess<{ req: NextRequest; params: P }, never>(
					user,
					[
						{
							type: spec.type,
							role: spec.role,
							id: () => id,
						},
					],
					{ req, params },
				)
				const log = buildLogger("resource-route", user.id)
				return await handler({ user, log }, req, {
					params: Promise.resolve(params),
				})
			} catch (err) {
				const resp = authzErrorToResponse(err)
				if (resp) return resp
				throw err
			}
		}
	},
}
