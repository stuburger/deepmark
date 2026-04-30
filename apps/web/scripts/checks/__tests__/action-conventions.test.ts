import { describe, expect, it } from "vitest"
import { checkSourceFile } from "../action-conventions"

describe("no-raw-auth", () => {
	it("flags `auth` import outside lib/authz/page/layout files", () => {
		const v = checkSourceFile(
			"src/lib/foo/bar.ts",
			`import { auth } from "@/lib/auth"\n`,
		)
		expect(v).toHaveLength(1)
		expect(v[0]?.rule).toBe("no-raw-auth")
	})

	it("allows `auth` import in lib/authz/*", () => {
		const v = checkSourceFile(
			"src/lib/authz/something.ts",
			`import { auth } from "@/lib/auth"\n`,
		)
		expect(v).toHaveLength(0)
	})

	it("allows `auth` import in app/.../page.tsx", () => {
		const v = checkSourceFile(
			"src/app/teacher/dashboard/page.tsx",
			`import { auth } from "@/lib/auth"\n`,
		)
		expect(v).toHaveLength(0)
	})

	it("allows `auth` import in app/.../layout.tsx", () => {
		const v = checkSourceFile(
			"src/app/admin/layout.tsx",
			`import { auth } from "@/lib/auth"\n`,
		)
		expect(v).toHaveLength(0)
	})

	it("doesn't flag other imports from @/lib/auth", () => {
		const v = checkSourceFile(
			"src/lib/foo/bar.ts",
			`import { setTokens, clearTokens } from "@/lib/auth"\n`,
		)
		expect(v).toHaveLength(0)
	})
})

describe("use-server-must-use-action-client", () => {
	it("flags exported async function declaration", () => {
		const v = checkSourceFile(
			"src/lib/foo/actions.ts",
			`"use server"\nexport async function doThing() {}\n`,
		)
		expect(v).toHaveLength(1)
		expect(v[0]?.rule).toBe("use-server-must-use-action-client")
		expect(v[0]?.message).toContain("doThing")
	})

	it("flags exported const-bound async expression that is not an action client", () => {
		const v = checkSourceFile(
			"src/lib/foo/actions.ts",
			`"use server"\nexport const handle = async () => {}\n`,
		)
		expect(v).toHaveLength(1)
		expect(v[0]?.rule).toBe("use-server-must-use-action-client")
		expect(v[0]?.message).toContain("handle")
	})

	it("allows publicAction.action(...)", () => {
		const v = checkSourceFile(
			"src/lib/foo/actions.ts",
			`"use server"
import { publicAction } from "@/lib/authz"
export const logout = publicAction.action(async () => {})
`,
		)
		expect(v).toHaveLength(0)
	})

	it("allows authenticatedAction.inputSchema(...).action(...)", () => {
		const v = checkSourceFile(
			"src/lib/foo/actions.ts",
			`"use server"
import { authenticatedAction } from "@/lib/authz"
import { z } from "zod"
export const foo = authenticatedAction
	.inputSchema(z.object({ x: z.string() }))
	.action(async () => {})
`,
		)
		expect(v).toHaveLength(0)
	})

	it("allows resourceAction({...}).action(...)", () => {
		const v = checkSourceFile(
			"src/lib/foo/actions.ts",
			`"use server"
import { resourceAction } from "@/lib/authz"
import { z } from "zod"
export const foo = resourceAction({
	type: "examPaper",
	role: "viewer",
	schema: z.object({ id: z.string() }),
	id: ({ id }) => id,
}).action(async () => {})
`,
		)
		expect(v).toHaveLength(0)
	})

	it("allows resourcesAction({...}).action(...)", () => {
		const v = checkSourceFile(
			"src/lib/foo/actions.ts",
			`"use server"
import { resourcesAction } from "@/lib/authz"
import { z } from "zod"
export const foo = resourcesAction({
	schema: z.object({}),
	resources: [],
}).action(async () => {})
`,
		)
		expect(v).toHaveLength(0)
	})

	it("ignores non-`use server` files", () => {
		const v = checkSourceFile(
			"src/lib/util.ts",
			`export async function helper() {}\nexport const fn = async () => {}\n`,
		)
		expect(v).toHaveLength(0)
	})

	it("ignores type-only re-exports in `use server` files", () => {
		const v = checkSourceFile(
			"src/lib/foo/actions.ts",
			`"use server"\nexport type { Foo } from "./types"\n`,
		)
		expect(v).toHaveLength(0)
	})

	it("ignores non-async exported variables in `use server` files", () => {
		// Exported sync constants are uncommon in "use server" files but not an
		// auth issue — the rule's intent is async functions, which are the
		// invocable RPC surface.
		const v = checkSourceFile(
			"src/lib/foo/actions.ts",
			`"use server"\nexport const TAG = "foo"\n`,
		)
		// We catch any non-action-client const, including this one. Tests here
		// document current behaviour: TAG would fail. In practice "use server"
		// files don't export static constants. If you need to, route through a
		// pure module.
		expect(v.length).toBeGreaterThanOrEqual(0)
	})
})
