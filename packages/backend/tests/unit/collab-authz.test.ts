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
	it("returns the editor role for an editor grant", async () => {
		await expect(
			authorizeCollabDocumentAccess(repo(), {
				userId: "user-1",
				documentName: "stage:submission:submission-1",
			}),
		).resolves.toEqual({ ok: true, role: "editor" })
	})

	it("returns the viewer role for a viewer grant (collab-server flips readOnly)", async () => {
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
				},
			),
		).resolves.toEqual({ ok: true, role: "viewer" })
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
				},
			),
		).resolves.toEqual({ ok: false, status: 403 })
	})

	it("rejects invalid document names", async () => {
		await expect(
			authorizeCollabDocumentAccess(repo(), {
				userId: "user-1",
				documentName: "not-a-doc",
			}),
		).resolves.toEqual({ ok: false, status: 404 })
	})
})
