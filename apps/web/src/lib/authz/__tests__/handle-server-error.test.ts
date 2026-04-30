import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AccessDeniedError, AuthRequiredError, NotFoundError } from "../errors"
import { handleServerError } from "../handle-server-error"

describe("handleServerError", () => {
	let consoleErr: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		consoleErr = vi.spyOn(console, "error").mockImplementation(() => {})
	})
	afterEach(() => {
		consoleErr.mockRestore()
	})

	it("returns the message verbatim for AuthRequiredError", () => {
		expect(handleServerError(new AuthRequiredError("please sign in"))).toBe(
			"please sign in",
		)
	})

	it("returns the message verbatim for AccessDeniedError", () => {
		expect(handleServerError(new AccessDeniedError("nope"))).toBe("nope")
	})

	it("returns the message verbatim for NotFoundError", () => {
		expect(handleServerError(new NotFoundError("gone"))).toBe("gone")
	})

	it("does NOT log when an authz error is handled (clean expected path)", () => {
		handleServerError(new AccessDeniedError("nope"))
		expect(consoleErr).not.toHaveBeenCalled()
	})

	it("returns a generic message for unknown errors and logs the stack", () => {
		const err = new Error("kaboom")
		expect(handleServerError(err)).toBe(
			"Something went wrong. Please try again.",
		)
		expect(consoleErr).toHaveBeenCalledTimes(1)
		const logged = consoleErr.mock.calls[0]?.[0] as string
		expect(logged).toContain("Unhandled action error")
		expect(logged).toContain("kaboom")
	})
})
