import { routeHandler } from "@/lib/authz"
import { clearTokens } from "@/lib/auth"
import { NextResponse } from "next/server"

// Public so a stale-session tab can still clear its cookies cleanly.
export const POST = routeHandler.public<Record<string, never>>(async (_ctx, req) => {
	const url = new URL(req.url)
	await clearTokens()
	return NextResponse.redirect(`${url.origin}/login`)
})
