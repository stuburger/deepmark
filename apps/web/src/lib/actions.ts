"use server"

import { publicAction } from "@/lib/authz"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { clearTokens, getClient } from "./auth"

export const logout = publicAction.action(async () => {
	await clearTokens()
	redirect("/login")
})

// Form-action variant: matches the `(formData?) => Promise<void>` shape that
// `<form action={…}>` requires, so it can be wired directly without a
// per-layout wrapper.
export async function logoutFormAction() {
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

export const login = publicAction.action(async () => {
	await authorizeWith("github")
})

export const loginWithGoogle = publicAction.action(async () => {
	await authorizeWith("google")
})
