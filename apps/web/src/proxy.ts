import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const CURRENCY_COOKIE = "dm-currency"
const COOKIE_MAX_AGE_DAYS = 365

/**
 * Read the viewer's country from the CDN header and stamp a `dm-currency`
 * cookie. Server components on the marketing site read the cookie to render
 * the right tier. Users can override later via a UI switcher (which writes the
 * same cookie); this proxy only sets it when missing.
 *
 * GB → gbp, everywhere else → usd. ZAR/AUD added when those markets justify
 * the tax-registration overhead.
 */
export function proxy(req: NextRequest) {
	const res = NextResponse.next()
	if (req.cookies.get(CURRENCY_COOKIE)) return res

	const country =
		req.headers.get("cloudfront-viewer-country") ??
		req.headers.get("x-vercel-ip-country") ??
		req.headers.get("cf-ipcountry")
	const currency = country?.toUpperCase() === "GB" ? "gbp" : "usd"

	res.cookies.set({
		name: CURRENCY_COOKIE,
		value: currency,
		path: "/",
		maxAge: 60 * 60 * 24 * COOKIE_MAX_AGE_DAYS,
		sameSite: "lax",
	})
	return res
}

export const config = {
	// Skip Next.js internals, static assets, and all /api/ routes. The
	// dm-currency cookie is only read by marketing/teacher page renders; API
	// routes don't need it and shouldn't have proxy in their path.
	matcher: ["/((?!_next/static|_next/image|favicon|api/|.*\\..*).*)"],
}
