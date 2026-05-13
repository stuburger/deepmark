"use client"

import { usePathname, useSearchParams } from "next/navigation"
import posthog from "posthog-js"
import { PostHogProvider as PHReactProvider } from "posthog-js/react"
import { Suspense, useEffect } from "react"

import { useCurrentUser } from "@/lib/users/use-current-user"

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "/ingest"
const STAGE = process.env.NEXT_PUBLIC_STAGE

// Only permanent stages (production, development) have the CDN `/ingest/*`
// route → PostHog EU. PR-preview stages share the dev Router via
// `Router.get()` and cannot add new routes; local `sst dev` has no Router
// in the request path at all. On those stages the provider no-ops so we
// don't fire requests that would 404.
const isPermanentStage = STAGE === "production" || STAGE === "development"
const ENABLED = Boolean(POSTHOG_KEY) && isPermanentStage

let initialized = false

function initPostHog() {
	if (initialized || !ENABLED || typeof window === "undefined") return
	initialized = true
	posthog.init(POSTHOG_KEY as string, {
		api_host: POSTHOG_HOST,
		ui_host: "https://eu.posthog.com",
		// Don't create person profiles for anonymous traffic — keeps MTU
		// usage tied to actual signed-in teachers.
		person_profiles: "identified_only",
		// We send pageviews manually because the App Router doesn't fire a
		// full navigation event the SDK can hook into.
		capture_pageview: false,
		capture_pageleave: true,
		// Student scripts, names, and emails appear throughout the UI.
		// Default to masking everything; opt out per element with
		// `data-ph-no-mask` / class `ph-no-mask` where it's safe.
		session_recording: {
			maskAllInputs: true,
			maskTextSelector: "*",
		},
		loaded: (ph) => {
			if (STAGE !== "production") ph.debug(false)
		},
	})
}

function PostHogPageview() {
	const pathname = usePathname()
	const searchParams = useSearchParams()

	useEffect(() => {
		if (!ENABLED || !pathname) return
		const qs = searchParams?.toString()
		const url = qs ? `${pathname}?${qs}` : pathname
		posthog.capture("$pageview", { $current_url: url })
	}, [pathname, searchParams])

	return null
}

function PostHogIdentify() {
	const { user } = useCurrentUser()

	useEffect(() => {
		if (!ENABLED) return
		if (user) {
			// `email` is also set on the person so the Stripe → PostHog
			// integration (which keys by Stripe customer email) merges into
			// the same person record.
			posthog.identify(user.id, {
				email: user.email ?? undefined,
				role: user.role,
				plan: user.plan ?? undefined,
			})
		} else {
			posthog.reset()
		}
	}, [user])

	return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		initPostHog()
	}, [])

	if (!ENABLED) return <>{children}</>

	return (
		<PHReactProvider client={posthog}>
			{/* useSearchParams bails out of SSG unless wrapped in Suspense. */}
			<Suspense fallback={null}>
				<PostHogPageview />
			</Suspense>
			<PostHogIdentify />
			{children}
		</PHReactProvider>
	)
}
