import type { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AuthUser } from "../principal"

const auth = vi.fn()
const loadAuthUser = vi.fn()
const assertExamPaperAccess = vi.fn()

vi.mock("@/lib/auth", () => ({ auth }))
vi.mock("../effective-roles", () => ({ loadAuthUser }))
vi.mock("../assertions", () => ({
	assertExamPaperAccess,
	assertSubmissionAccess: vi.fn(),
	assertQuestionAccess: vi.fn(),
	assertMarkSchemeAccess: vi.fn(),
	assertPdfIngestionJobAccess: vi.fn(),
	assertBatchAccess: vi.fn(),
	assertStagedScriptAccess: vi.fn(),
}))

const TEACHER: AuthUser = { id: "u1", email: "t@x", systemRole: "teacher" }
const ADMIN: AuthUser = { id: "u2", email: "a@x", systemRole: "admin" }

const fakeReq = () =>
	({
		headers: new Headers(),
		signal: new AbortController().signal,
	}) as unknown as NextRequest

beforeEach(() => {
	auth.mockReset()
	loadAuthUser.mockReset()
	assertExamPaperAccess.mockReset()
})

describe("routeHandler.public", () => {
	it("calls handler with no session resolution", async () => {
		const { routeHandler } = await import("../route-handler")
		const handler = routeHandler.public(async () => new Response("ok"))
		const res = await handler(fakeReq(), { params: Promise.resolve({}) })
		expect(res.status).toBe(200)
		expect(await res.text()).toBe("ok")
		expect(auth).not.toHaveBeenCalled()
	})
})

describe("routeHandler.authenticated", () => {
	it("calls handler with the resolved user", async () => {
		auth.mockResolvedValue({ userId: "u1", email: "t@x" })
		loadAuthUser.mockResolvedValue(TEACHER)
		const { routeHandler } = await import("../route-handler")
		const handler = routeHandler.authenticated<Record<string, never>>(
			async (ctx) => {
				return new Response(ctx.user.id)
			},
		)
		const res = await handler(fakeReq(), { params: Promise.resolve({}) })
		expect(await res.text()).toBe("u1")
	})

	it("returns 401 when no session", async () => {
		auth.mockResolvedValue(null)
		const { routeHandler } = await import("../route-handler")
		const handler = routeHandler.authenticated(async () => new Response("ok"))
		const res = await handler(fakeReq(), { params: Promise.resolve({}) })
		expect(res.status).toBe(401)
	})
})

describe("routeHandler.admin", () => {
	it("returns 403 for non-admin", async () => {
		auth.mockResolvedValue({ userId: "u1", email: "t@x" })
		loadAuthUser.mockResolvedValue(TEACHER)
		const { routeHandler } = await import("../route-handler")
		const handler = routeHandler.admin(async () => new Response("ok"))
		const res = await handler(fakeReq(), { params: Promise.resolve({}) })
		expect(res.status).toBe(403)
	})

	it("passes for admin", async () => {
		auth.mockResolvedValue({ userId: "u2", email: "a@x" })
		loadAuthUser.mockResolvedValue(ADMIN)
		const { routeHandler } = await import("../route-handler")
		const handler = routeHandler.admin(async () => new Response("ok"))
		const res = await handler(fakeReq(), { params: Promise.resolve({}) })
		expect(res.status).toBe(200)
	})
})

describe("routeHandler.resource", () => {
	it("asserts resource access using the id resolver", async () => {
		auth.mockResolvedValue({ userId: "u1", email: "t@x" })
		loadAuthUser.mockResolvedValue(TEACHER)
		assertExamPaperAccess.mockResolvedValue({ ok: true })
		const { routeHandler } = await import("../route-handler")
		const handler = routeHandler.resource<{ paperId: string }>(
			{
				type: "examPaper",
				role: "viewer",
				id: async (_req, { params }) => params.paperId,
			},
			async (ctx) => new Response(ctx.user.id),
		)
		const res = await handler(fakeReq(), {
			params: Promise.resolve({ paperId: "p1" }),
		})
		expect(res.status).toBe(200)
		expect(assertExamPaperAccess).toHaveBeenCalledWith(TEACHER, "p1", "viewer")
	})

	it("returns 403 when access is denied", async () => {
		auth.mockResolvedValue({ userId: "u1", email: "t@x" })
		loadAuthUser.mockResolvedValue(TEACHER)
		assertExamPaperAccess.mockResolvedValue({ ok: false, error: "no access" })
		const { routeHandler } = await import("../route-handler")
		const handler = routeHandler.resource<{ paperId: string }>(
			{
				type: "examPaper",
				role: "viewer",
				id: async (_req, { params }) => params.paperId,
			},
			async () => new Response("never"),
		)
		const res = await handler(fakeReq(), {
			params: Promise.resolve({ paperId: "p1" }),
		})
		expect(res.status).toBe(403)
	})

	it("returns 404 when assertion reports a missing resource", async () => {
		auth.mockResolvedValue({ userId: "u1", email: "t@x" })
		loadAuthUser.mockResolvedValue(TEACHER)
		assertExamPaperAccess.mockResolvedValue({
			ok: false,
			error: "Paper not found",
		})
		const { routeHandler } = await import("../route-handler")
		const handler = routeHandler.resource<{ paperId: string }>(
			{
				type: "examPaper",
				role: "viewer",
				id: async (_req, { params }) => params.paperId,
			},
			async () => new Response("never"),
		)
		const res = await handler(fakeReq(), {
			params: Promise.resolve({ paperId: "missing" }),
		})
		expect(res.status).toBe(404)
	})

	it("re-throws non-authz errors so Next can render the error boundary", async () => {
		auth.mockResolvedValue({ userId: "u1", email: "t@x" })
		loadAuthUser.mockResolvedValue(TEACHER)
		assertExamPaperAccess.mockResolvedValue({ ok: true })
		const { routeHandler } = await import("../route-handler")
		const handler = routeHandler.resource<{ paperId: string }>(
			{
				type: "examPaper",
				role: "viewer",
				id: async (_req, { params }) => params.paperId,
			},
			async () => {
				throw new Error("boom")
			},
		)
		await expect(
			handler(fakeReq(), { params: Promise.resolve({ paperId: "p1" }) }),
		).rejects.toThrow("boom")
	})
})
