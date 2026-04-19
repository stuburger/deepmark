import { describe, expect, it } from "vitest"
import { isRecoverableAnnotationError } from "../../src/lib/annotations/annotate-result"

/**
 * Pins the annotation-failure recovery policy. Adjust the predicate (and this
 * test) when real runtime observations show a class of error we should treat
 * differently; do not silently broaden recovery.
 */
describe("isRecoverableAnnotationError", () => {
	it("treats generic Error as recoverable (default SDK wrapping)", () => {
		expect(isRecoverableAnnotationError(new Error("boom"))).toBe(true)
	})

	it("treats TypeError as recoverable (Node fetch network errors throw TypeError)", () => {
		expect(isRecoverableAnnotationError(new TypeError("fetch failed"))).toBe(
			true,
		)
	})

	it("treats SyntaxError as recoverable (JSON.parse on malformed model output)", () => {
		expect(
			isRecoverableAnnotationError(new SyntaxError("Unexpected token")),
		).toBe(true)
	})

	it("treats non-Error throws as recoverable (strings, objects, null)", () => {
		expect(isRecoverableAnnotationError("some string")).toBe(true)
		expect(isRecoverableAnnotationError({ message: "fake" })).toBe(true)
		expect(isRecoverableAnnotationError(null)).toBe(true)
	})

	it("treats AISDKError-shaped subclasses as recoverable", () => {
		class APICallError extends Error {
			constructor(msg: string) {
				super(msg)
				this.name = "APICallError"
			}
		}
		class NoObjectGeneratedError extends Error {
			constructor(msg: string) {
				super(msg)
				this.name = "NoObjectGeneratedError"
			}
		}
		expect(isRecoverableAnnotationError(new APICallError("429"))).toBe(true)
		expect(
			isRecoverableAnnotationError(new NoObjectGeneratedError("schema")),
		).toBe(true)
	})

	it("re-throws ReferenceError (undefined identifier — programming bug)", () => {
		expect(
			isRecoverableAnnotationError(new ReferenceError("x is not defined")),
		).toBe(false)
	})

	it("re-throws RangeError (stack overflow / invalid bounds — programming bug)", () => {
		expect(isRecoverableAnnotationError(new RangeError("stack"))).toBe(false)
	})
})
