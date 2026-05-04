import {
	BALANCE_ERROR_PREFIX,
	InsufficientBalanceError,
} from "@/lib/billing/types"
import { log } from "@/lib/logger"
import { isAuthzError } from "./errors"

const TAG = "authz/server-error"

/**
 * Maps any error thrown inside an action handler or middleware to the string
 * shown to the user as `serverError`. Authz errors carry a clean message;
 * everything else is logged with a stack and replaced with a generic message.
 */
export function handleServerError(err: Error): string {
	if (isAuthzError(err)) {
		return err.message
	}
	if (err instanceof InsufficientBalanceError) {
		// Sentinel prefix is detected by the client toast helper to render an
		// Upgrade action button. Stripped before display.
		return `${BALANCE_ERROR_PREFIX}${err.message}`
	}
	log.error(TAG, "Unhandled action error", {
		errorName: err.name,
		errorMessage: err.message,
		stack: err.stack,
	})
	return "Something went wrong. Please try again."
}
