import { getClient, setTokens } from "@/lib/auth"
import { NextResponse, type NextRequest } from "next/server"

export async function GET(req: NextRequest) {
	const url = new URL(req.url)
	const code = url.searchParams.get("code")

	if (!code) {
		return NextResponse.json({ error: "No code provided" }, { status: 400 })
	}

	const exchanged = await getClient().exchange(code, `${url.origin}/api/callback`)

	if (exchanged.err) {
		return NextResponse.json(exchanged.err, { status: 400 })
	}

	await setTokens(exchanged.tokens.access, exchanged.tokens.refresh)

	return NextResponse.redirect(`${url.origin}/`)
}
