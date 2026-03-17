import { clearTokens } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
	const url = new URL(req.url)
	await clearTokens()
	return NextResponse.redirect(`${url.origin}/login`)
}
