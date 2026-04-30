import { createClient } from "@openauthjs/openauth/client"
import { createSubjects } from "@openauthjs/openauth/subject"
import { cookies as getCookies } from "next/headers"
import { nullable, object, string } from "valibot"

const subjects = createSubjects({
	user: object({
		userId: string(),
		email: nullable(string()),
	}),
})

let _client: ReturnType<typeof createClient> | null = null
export function getClient() {
	if (!_client) {
		_client = createClient({
			clientID: "nextjs",
			issuer: process.env.OPENAUTH_ISSUER ?? "",
		})
	}
	return _client
}

export type SessionUser = {
	userId: string
	email: string | null
}

export async function setTokens(access: string, refresh: string) {
	const cookies = await getCookies()

	cookies.set({
		name: "access_token",
		value: access,
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: 60 * 60 * 24 * 30,
	})
	cookies.set({
		name: "refresh_token",
		value: refresh,
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: 60 * 60 * 24 * 30,
	})
}

export async function clearTokens() {
	const cookies = await getCookies()
	cookies.delete("access_token")
	cookies.delete("refresh_token")
}

export async function auth(): Promise<SessionUser | null> {
	const cookies = await getCookies()
	const accessToken = cookies.get("access_token")
	const refreshToken = cookies.get("refresh_token")

	if (!accessToken) {
		return null
	}

	const verified = await getClient().verify(subjects, accessToken.value, {
		refresh: refreshToken?.value,
	})

	if (verified.err) {
		return null
	}

	if (verified.tokens) {
		await setTokens(verified.tokens.access, verified.tokens.refresh)
	}

	return {
		userId: verified.subject.properties.userId,
		email: verified.subject.properties.email,
	}
}
