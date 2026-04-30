/**
 * Typed errors thrown from authz middleware. `handleServerError` (for actions)
 * and `routeHandler` (for /api routes) recognise these and translate them into
 * user-facing strings or HTTP statuses respectively.
 *
 * Anything that is *not* one of these becomes a generic "Something went wrong"
 * to the client and a logged stack on the server.
 */

export class AuthRequiredError extends Error {
	readonly httpStatus = 401
	constructor(message = "You need to sign in to do that") {
		super(message)
		this.name = "AuthRequiredError"
	}
}

export class AccessDeniedError extends Error {
	readonly httpStatus = 403
	constructor(message = "You do not have access to this resource") {
		super(message)
		this.name = "AccessDeniedError"
	}
}

export class NotFoundError extends Error {
	readonly httpStatus = 404
	constructor(message = "Not found") {
		super(message)
		this.name = "NotFoundError"
	}
}

export type AuthzError = AuthRequiredError | AccessDeniedError | NotFoundError

export function isAuthzError(err: unknown): err is AuthzError {
	return (
		err instanceof AuthRequiredError ||
		err instanceof AccessDeniedError ||
		err instanceof NotFoundError
	)
}
