import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AuthUser } from "../principal"

const assertExamPaperAccess = vi.fn()
const assertSubmissionAccess = vi.fn()
const assertQuestionAccess = vi.fn()
const assertMarkSchemeAccess = vi.fn()
const assertPdfIngestionJobAccess = vi.fn()
const assertBatchAccess = vi.fn()
const assertStagedScriptAccess = vi.fn()

vi.mock("../assertions", () => ({
	assertExamPaperAccess,
	assertSubmissionAccess,
	assertQuestionAccess,
	assertMarkSchemeAccess,
	assertPdfIngestionJobAccess,
	assertBatchAccess,
	assertStagedScriptAccess,
}))

const USER: AuthUser = { id: "u1", email: "u@x", systemRole: "teacher" }

beforeEach(() => {
	for (const fn of [
		assertExamPaperAccess,
		assertSubmissionAccess,
		assertQuestionAccess,
		assertMarkSchemeAccess,
		assertPdfIngestionJobAccess,
		assertBatchAccess,
		assertStagedScriptAccess,
	]) {
		fn.mockReset()
	}
})

describe("assertResource", () => {
	it("dispatches by resource type", async () => {
		assertQuestionAccess.mockResolvedValue({ ok: true })
		const { assertResource } = await import("../assert-resource")
		await assertResource(USER, { type: "question", id: "q1", role: "editor" })
		expect(assertQuestionAccess).toHaveBeenCalledWith(USER, "q1", "editor")
	})

	it("throws AccessDeniedError when the assertion denies access", async () => {
		assertExamPaperAccess.mockResolvedValue({ ok: false, error: "no access" })
		const { assertResource } = await import("../assert-resource")
		const { AccessDeniedError } = await import("../errors")
		await expect(
			assertResource(USER, { type: "examPaper", id: "p1", role: "viewer" }),
		).rejects.toBeInstanceOf(AccessDeniedError)
	})

	it("throws NotFoundError when the assertion reports a missing resource", async () => {
		assertSubmissionAccess.mockResolvedValue({
			ok: false,
			error: "Submission not found",
		})
		const { assertResource } = await import("../assert-resource")
		const { NotFoundError } = await import("../errors")
		await expect(
			assertResource(USER, { type: "submission", id: "s1", role: "viewer" }),
		).rejects.toBeInstanceOf(NotFoundError)
	})
})
