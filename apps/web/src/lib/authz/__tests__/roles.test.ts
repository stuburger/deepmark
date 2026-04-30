import { describe, expect, it } from "vitest"
import { normaliseEmail } from "../principal"
import { maxGrantRole, meetsMinimum, roleRank, rolesAtLeast } from "../roles"

describe("resource grant roles", () => {
	it("orders roles from owner down to viewer", () => {
		expect(roleRank("owner")).toBeGreaterThan(roleRank("editor"))
		expect(roleRank("editor")).toBeGreaterThan(roleRank("viewer"))
	})

	it("checks minimum access", () => {
		expect(meetsMinimum("owner", "viewer")).toBe(true)
		expect(meetsMinimum("editor", "viewer")).toBe(true)
		expect(meetsMinimum("viewer", "editor")).toBe(false)
		expect(meetsMinimum(null, "viewer")).toBe(false)
	})

	it("chooses the strongest grant", () => {
		expect(maxGrantRole("viewer", "editor")).toBe("editor")
		expect(maxGrantRole("owner", "editor")).toBe("owner")
		expect(maxGrantRole(null, "viewer")).toBe("viewer")
	})

	it("returns roles that satisfy a threshold", () => {
		expect(rolesAtLeast("editor")).toEqual(["owner", "editor"])
		expect(rolesAtLeast("viewer")).toEqual(["owner", "editor", "viewer"])
	})
})

describe("grant principals", () => {
	it("normalises pending invite emails", () => {
		expect(normaliseEmail("  TEACHER@Example.COM ")).toBe("teacher@example.com")
	})
})
