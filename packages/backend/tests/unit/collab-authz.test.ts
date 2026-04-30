import { describe, expect, it } from "vitest"
import {
	type CollabAuthzRepository,
	authorizeCollabDocumentAccess,
} from "../../src/collab-authz"

function repo(
	overrides: Partial<CollabAuthzRepository> = {},
): CollabAuthzRepository {
	return {
		async loadUser() {
			return {
				id: "user-1",
				email: "teacher@example.com",
				systemRole: "teacher",
			}
		},
		async loadSubmission() {
			return {
				uploadedByUserId: "owner",
				examPaperId: "paper-1",
			}
		},
		async loadExamPaper() {
			return { ownerUserId: "owner" }
		},
		async loadResourceGrants(resourceType) {
			if (resourceType === "student_submission") {
				return [
					{
						role: "editor",
						principalUserId: "user-1",
						principalEmail: null,
					},
				]
			}
			return []
		},
		...overrides,
	}
}

describe("collab authz", () => {
	it("accepts an editor grant for a submission document", async () => {
		await expect(
			authorizeCollabDocumentAccess(repo(), {
				userId: "user-1",
				documentName: "stage:submission:submission-1",
				access: "editor",
			}),
		).resolves.toEqual({ ok: true })
	})

	it("rejects viewer-only submission access for writable collab", async () => {
		await expect(
			authorizeCollabDocumentAccess(
				repo({
					async loadResourceGrants(resourceType) {
						if (resourceType !== "student_submission") return []
						return [
							{
								role: "viewer",
								principalUserId: "user-1",
								principalEmail: null,
							},
						]
					},
				}),
				{
					userId: "user-1",
					documentName: "stage:submission:submission-1",
					access: "editor",
				},
			),
		).resolves.toEqual({ ok: false, status: 403 })
	})

	it("rejects users without a grant", async () => {
		await expect(
			authorizeCollabDocumentAccess(
				repo({
					async loadResourceGrants() {
						return []
					},
				}),
				{
					userId: "user-1",
					documentName: "stage:submission:submission-1",
					access: "editor",
				},
			),
		).resolves.toEqual({ ok: false, status: 403 })
	})

	it("rejects invalid document names", async () => {
		await expect(
			authorizeCollabDocumentAccess(repo(), {
				userId: "user-1",
				documentName: "not-a-doc",
				access: "editor",
			}),
		).resolves.toEqual({ ok: false, status: 404 })
	})
})
