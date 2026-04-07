"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { clearTokens, getClient } from "./auth"

export async function logout() {
	await clearTokens()
	redirect("/login")
}

async function authorizeWith(provider: "github" | "google") {
	const headersList = await headers()
	const host = headersList.get("host")

	if (!host) {
		throw new Error("Host header is missing")
	}

	const protocol = headersList.get("x-forwarded-proto") || "http"
	const origin = `${protocol}://${host}`
	const redirectURI = `${origin}/api/callback`

	const { url } = await getClient().authorize(redirectURI, "code", { provider })

	redirect(url)
}

export async function login() {
	await authorizeWith("github")
}

export async function loginWithGoogle() {
	await authorizeWith("google")
}
