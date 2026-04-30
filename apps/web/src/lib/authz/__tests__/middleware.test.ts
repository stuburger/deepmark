import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AuthUser } from "../principal"

const auth = vi.fn()
const loadAuthUser = vi.fn()
const assertExamPaperAccess = vi.fn()
const assertQuestionAccess = vi.fn()

vi.mock("@/lib/auth", () => ({ auth }))
vi.mock("../effective-roles", () => ({ loadAuthUser }))
vi.mock("../assertions", () => ({
	assertExamPaperAccess,
	assertQuestionAccess,
	assertSubmissionAccess: vi.fn(),
	assertMarkSchemeAccess: vi.fn(),
	assertPdfIngestionJobAccess: vi.fn(),
	assertBatchAccess: vi.fn(),
	assertStagedScriptAccess: vi.fn(),
}))

const TEACHER: AuthUser = { id: "u1", email: "t@x", systemRole: "teacher" }
const ADMIN: AuthUser = { id: "u2", email: "a@x", systemRole: "admin" }

beforeEach(() => {
	auth.mockReset()
	loadAuthUser.mockReset()
	assertExamPaperAccess.mockReset()
	assertQuestionAccess.mockReset()
})

describe("resolveSessionUser", () => {
	it("returns the loaded AuthUser when session is valid", async () => {
		auth.mockResolvedValue({ userId: "u1", email: "t@x" })
		loadAuthUser.mockResolvedValue(TEACHER)
		const { resolveSessionUser } = await import("../middleware/require-session")
		await expect(resolveSessionUser()).resolves.toEqual(TEACHER)
		expect(loadAuthUser).toHaveBeenCalledWith("u1")
	})

	it("throws AuthRequiredError when no session cookie", async () => {
		auth.mockResolvedValue(null)
		const { resolveSessionUser } = await import("../middleware/require-session")
		const { AuthRequiredError } = await import("../errors")
		await expect(resolveSessionUser()).rejects.toBeInstanceOf(AuthRequiredError)
	})

	it("throws AuthRequiredError when the session user has been deleted", async () => {
		auth.mockResolvedValue({ userId: "ghost", email: null })
		loadAuthUser.mockResolvedValue(null)
		const { resolveSessionUser } = await import("../middleware/require-session")
		const { AuthRequiredError } = await import("../errors")
		await expect(resolveSessionUser()).rejects.toBeInstanceOf(AuthRequiredError)
	})
})

describe("requireAdminUser", () => {
	it("passes for admin systemRole", async () => {
		const { requireAdminUser } = await import("../middleware/require-admin")
		expect(() => requireAdminUser(ADMIN)).not.toThrow()
	})

	it("throws AccessDeniedError for non-admin", async () => {
		const { requireAdminUser } = await import("../middleware/require-admin")
		const { AccessDeniedError } = await import("../errors")
		expect(() => requireAdminUser(TEACHER)).toThrow(AccessDeniedError)
	})
})

describe("assertSpecAccess (resource middleware core)", () => {
	it("asserts a single resource and resolves the id from input", async () => {
		assertExamPaperAccess.mockResolvedValue({ ok: true })
		const { assertSpecAccess } = await import("../middleware/require-resource")
		await assertSpecAccess(
			TEACHER,
			[
				{
					type: "examPaper",
					role: "viewer",
					id: (i: { paperId: string }) => i.paperId,
				},
			],
			{ paperId: "p1" },
		)
		expect(assertExamPaperAccess).toHaveBeenCalledWith(TEACHER, "p1", "viewer")
	})

	it("asserts a list of resources from `ids`", async () => {
		assertQuestionAccess.mockResolvedValue({ ok: true })
		const { assertSpecAccess } = await import("../middleware/require-resource")
		await assertSpecAccess(
			TEACHER,
			[
				{
					type: "question",
					role: "editor",
					ids: (i: { ids: string[] }) => i.ids,
				},
			],
			{ ids: ["q1", "q2", "q3"] },
		)
		expect(assertQuestionAccess).toHaveBeenCalledTimes(3)
		expect(assertQuestionAccess).toHaveBeenCalledWith(TEACHER, "q1", "editor")
		expect(assertQuestionAccess).toHaveBeenCalledWith(TEACHER, "q2", "editor")
		expect(assertQuestionAccess).toHaveBeenCalledWith(TEACHER, "q3", "editor")
	})

	it("rejects on the first denied resource", async () => {
		assertExamPaperAccess.mockResolvedValueOnce({
			ok: false,
			error: "no access",
		})
		const { assertSpecAccess } = await import("../middleware/require-resource")
		const { AccessDeniedError } = await import("../errors")
		await expect(
			assertSpecAccess(
				TEACHER,
				[{ type: "examPaper", role: "viewer", id: () => "p1" }],
				{},
			),
		).rejects.toBeInstanceOf(AccessDeniedError)
	})
})

describe("buildLogger", () => {
	let consoleLog: ReturnType<typeof vi.spyOn>
	let consoleErr: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		consoleLog = vi.spyOn(console, "log").mockImplementation(() => {})
		consoleErr = vi.spyOn(console, "error").mockImplementation(() => {})
	})
	afterEach(() => {
		consoleLog.mockRestore()
		consoleErr.mockRestore()
	})

	it("injects userId into every log line", async () => {
		const { buildLogger } = await import("../middleware/attach-logger")
		const log = buildLogger("test-tag", "user-42")
		log.info("doing the thing", { extra: 1 })
		const line = consoleLog.mock.calls[0]?.[0] as string
		const parsed = JSON.parse(line)
		expect(parsed.userId).toBe("user-42")
		expect(parsed.tag).toBe("test-tag")
		expect(parsed.message).toBe("doing the thing")
		expect(parsed.extra).toBe(1)
	})

	it("passes data through unchanged when caller adds their own userId", async () => {
		const { buildLogger } = await import("../middleware/attach-logger")
		const log = buildLogger("test-tag", "user-42")
		log.error("boom", { userId: "override" })
		const line = consoleErr.mock.calls[0]?.[0] as string
		const parsed = JSON.parse(line)
		// Caller-supplied userId wins (spread order); this is fine because the
		// pre-bound id is still observable via the otherwise-injected key.
		expect(parsed.userId).toBe("override")
	})
})
