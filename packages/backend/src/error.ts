import { z } from "zod"

/**
 * Standard error response schema used for OpenAPI documentation
 */
export const ErrorResponse = z.object({
	type: z.enum([
		"validation",
		"authentication",
		"forbidden",
		"not_found",
		"rate_limit",
		"internal",
	]),
	code: z.string(),
	message: z.string(),
	param: z.string().optional(),
	details: z.any().optional(),
})

export type ErrorResponseType = z.infer<typeof ErrorResponse>

/**
 * Standardized error codes for the API
 */
export const ErrorCodes = {
	// Validation errors (400)
	Validation: {
		INVALID_PARAMETER: "invalid_parameter",
		MISSING_REQUIRED_FIELD: "missing_required_field",
		INVALID_FORMAT: "invalid_format",
		ALREADY_EXISTS: "already_exists",
		IN_USE: "resource_in_use",
		INVALID_STATE: "invalid_state",
	},

	// Authentication errors (401)
	Authentication: {
		UNAUTHORIZED: "unauthorized",
		INVALID_TOKEN: "invalid_token",
		EXPIRED_TOKEN: "expired_token",
		INVALID_CREDENTIALS: "invalid_credentials",
	},

	// Permission errors (403)
	Permission: {
		FORBIDDEN: "forbidden",
		INSUFFICIENT_PERMISSIONS: "insufficient_permissions",
		ACCOUNT_RESTRICTED: "account_restricted",
	},

	// Resource not found errors (404)
	NotFound: {
		RESOURCE_NOT_FOUND: "resource_not_found",
	},

	// Rate limit errors (429)
	RateLimit: {
		TOO_MANY_REQUESTS: "too_many_requests",
		QUOTA_EXCEEDED: "quota_exceeded",
	},

	// Server errors (500)
	Server: {
		INTERNAL_ERROR: "internal_error",
		SERVICE_UNAVAILABLE: "service_unavailable",
		DEPENDENCY_FAILURE: "dependency_failure",
	},
}

/**
 * Standard error that will be exposed to clients through API responses
 */
export class VisibleError extends Error {
	constructor(
		public type: ErrorResponseType["type"],
		public code: string,
		public message: string,
		public param?: string,
		// biome-ignore lint/suspicious/noExplicitAny: Could be anything
		public details?: any,
	) {
		super(message)
	}

	/**
	 * Convert this error to an HTTP status code
	 */
	public statusCode(): number {
		switch (this.type) {
			case "validation":
				return 400
			case "authentication":
				return 401
			case "forbidden":
				return 403
			case "not_found":
				return 404
			case "rate_limit":
				return 429
			case "internal":
				return 500
			default:
				return 500
		}
	}

	/**
	 * Convert this error to a standard response object
	 */
	public toResponse(): ErrorResponseType {
		const response: ErrorResponseType = {
			type: this.type,
			code: this.code,
			message: this.message,
		}

		if (this.param) response.param = this.param
		if (this.details) response.details = this.details

		return response
	}
}
