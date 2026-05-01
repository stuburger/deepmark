import { Prisma } from "@mcp-gcse/db"
import { describe, expect, it } from "vitest"

import { isTransientError } from "../transient-error"

function knownPrismaError(code: string): Prisma.PrismaClientKnownRequestError {
	return new Prisma.PrismaClientKnownRequestError(`test-${code}`, {
		code,
		clientVersion: "test",
	})
}

describe("isTransientError", () => {
	const transientCodes = ["P1001", "P1002", "P1008", "P1017", "P2024", "P2034"]

	for (const code of transientCodes) {
		it(`returns true for Prisma code ${code} (transient)`, () => {
			expect(isTransientError(knownPrismaError(code))).toBe(true)
		})
	}

	const permanentCodes = [
		"P2002", // unique constraint violation
		"P2025", // record to update not found
		"P2003", // foreign key constraint
		"P2014", // required relation violation
	]
	for (const code of permanentCodes) {
		it(`returns false for Prisma code ${code} (permanent)`, () => {
			expect(isTransientError(knownPrismaError(code))).toBe(false)
		})
	}

	it("returns true for PrismaClientInitializationError", () => {
		const err = new Prisma.PrismaClientInitializationError(
			"can't connect",
			"test",
		)
		expect(isTransientError(err)).toBe(true)
	})

	it("returns true for PrismaClientRustPanicError", () => {
		const err = new Prisma.PrismaClientRustPanicError("kaboom", "test")
		expect(isTransientError(err)).toBe(true)
	})

	it("returns false for a plain Error", () => {
		expect(isTransientError(new Error("anything"))).toBe(false)
	})

	it("returns false for null / undefined / non-Error", () => {
		expect(isTransientError(null)).toBe(false)
		expect(isTransientError(undefined)).toBe(false)
		expect(isTransientError("string")).toBe(false)
		expect(isTransientError({ code: "P1001" })).toBe(false) // duck-typed, not an instance
	})
})
