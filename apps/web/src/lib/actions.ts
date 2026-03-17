"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { client } from "./auth"

export async function login() {
	const headersList = await headers()
	const host = headersList.get("host")

	if (!host) {
		throw new Error("Host header is missing")
	}

	const protocol = headersList.get("x-forwarded-proto") || "http"
	const origin = `${protocol}://${host}`
	const redirectURI = `${origin}/api/callback`

	const { url } = await client.authorize(redirectURI, "code", {
		provider: "github",
	})

	redirect(url)
}
