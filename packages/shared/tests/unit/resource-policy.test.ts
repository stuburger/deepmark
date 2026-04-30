import { describe, expect, it } from "vitest"
import {
	type ResourceGrantCandidate,
	type ResourcePrincipal,
	effectiveExamPaperResourceRole,
	effectiveSubmissionResourceRole,
	grantMatchesPrincipal,
	maxMatchingGrantRole,
	meetsResourceRole,
	removingOrDowngradingFinalOwner,
	resourceRolesAtLeast,
} from "../../src/authz"

const teacher: ResourcePrincipal = {
	id: "user-teacher",
	email: "teacher@example.com",
	systemRole: "teacher",
}

const otherTeacher: ResourcePrincipal = {
	id: "user-other",
	email: "other@example.com",
	systemRole: "teacher",
}

const admin: ResourcePrincipal = {
	id: "user-admin",
	email: "admin@example.com",
	systemRole: "admin",
}

describe("resource role policy", () => {
	it("orders roles by minimum permission", () => {
		expect(meetsResourceRole("owner", "viewer")).toBe(true)
		expect(meetsResourceRole("editor", "viewer")).toBe(true)
		expect(meetsResourceRole("viewer", "editor")).toBe(false)
		expect(resourceRolesAtLeast("editor")).toEqual(["owner", "editor"])
	})

	it("matches direct and pending-email grants to a principal", () => {
		expect(
			grantMatchesPrincipal(teacher, {
				principalUserId: "user-teacher",
				principalEmail: null,
			}),
		).toBe(true)
		expect(
			grantMatchesPrincipal(teacher, {
				principalUserId: null,
				principalEmail: " TEACHER@EXAMPLE.COM ",
			}),
		).toBe(true)
	})

	it("uses the strongest matching grant", () => {
		const grants: ResourceGrantCandidate[] = [
			{ role: "viewer", principalUserId: teacher.id, principalEmail: null },
			{ role: "editor", principalUserId: null, principalEmail: teacher.email },
			{ role: "owner", principalUserId: otherTeacher.id, principalEmail: null },
		]

		expect(maxMatchingGrantRole(teacher, grants)).toBe("editor")
	})

	it("grants paper owner from legacy ownership and direct grants", () => {
		expect(
			effectiveExamPaperResourceRole({
				principal: teacher,
				ownerUserId: teacher.id,
				grants: [],
			}),
		).toBe("owner")

		expect(
			effectiveExamPaperResourceRole({
				principal: otherTeacher,
				ownerUserId: teacher.id,
				grants: [
					{
						role: "viewer",
						principalUserId: otherTeacher.id,
						principalEmail: null,
					},
				],
			}),
		).toBe("viewer")
	})

	it("cascades exam paper access to submissions", () => {
		expect(
			effectiveSubmissionResourceRole({
				principal: otherTeacher,
				uploadedByUserId: teacher.id,
				parentExamPaperRole: "editor",
				grants: [],
			}),
		).toBe("editor")
	})

	it("does not let direct submission grants imply parent paper access", () => {
		const directSubmissionGrant: ResourceGrantCandidate = {
			role: "editor",
			principalUserId: otherTeacher.id,
			principalEmail: null,
		}

		expect(
			effectiveSubmissionResourceRole({
				principal: otherTeacher,
				uploadedByUserId: teacher.id,
				parentExamPaperRole: null,
				grants: [directSubmissionGrant],
			}),
		).toBe("editor")
		expect(
			effectiveExamPaperResourceRole({
				principal: otherTeacher,
				ownerUserId: teacher.id,
				grants: [],
			}),
		).toBeNull()
	})

	it("treats admin as a global bypass", () => {
		expect(
			effectiveExamPaperResourceRole({
				principal: admin,
				ownerUserId: teacher.id,
				grants: [],
			}),
		).toBe("owner")
	})

	it("protects the final owner grant", () => {
		expect(
			removingOrDowngradingFinalOwner({
				currentRole: "owner",
				nextRole: "viewer",
				activeOwnerCount: 1,
			}),
		).toBe(true)
		expect(
			removingOrDowngradingFinalOwner({
				currentRole: "owner",
				nextRole: "viewer",
				activeOwnerCount: 2,
			}),
		).toBe(false)
		expect(
			removingOrDowngradingFinalOwner({
				currentRole: "owner",
				nextRole: null,
				activeOwnerCount: 1,
			}),
		).toBe(true)
	})
})
