import { routeHandler } from "@/lib/authz"
import { getClient, setTokens } from "@/lib/auth"
import { NextResponse } from "next/server"

export const GET = routeHandler.public<Record<string, never>>(async (_ctx, req) => {
	const url = new URL(req.url)
	const code = url.searchParams.get("code")

	if (!code) {
		return NextResponse.json({ error: "No code provided" }, { status: 400 })
	}

	const exchanged = await getClient().exchange(
		code,
		`${url.origin}/api/callback`,
	)

	if (exchanged.err) {
		return NextResponse.json(exchanged.err, { status: 400 })
	}

	await setTokens(exchanged.tokens.access, exchanged.tokens.refresh)

	return NextResponse.redirect(`${url.origin}/`)
})
