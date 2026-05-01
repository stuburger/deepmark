"use client"

import { toast } from "sonner"

import { TRIAL_ERROR_PREFIX } from "./types"

/**
 * Surface a server error from a marking-trigger action.
 *
 * If the message carries the trial-exhausted sentinel (set by
 * `handleServerError` for `TrialExhaustedError`), strip it and render a
 * sonner toast with an "Upgrade" action button that takes the user to
 * /pricing. Otherwise render a plain error toast.
 *
 * Accepts either a serverError string (next-safe-action shape) or an Error
 * instance (TanStack Query's `onError` arg). Ignores nullish input.
 */
export function surfaceMarkingError(input: string | Error | null | undefined) {
	if (!input) return
	const raw = typeof input === "string" ? input : input.message
	if (raw.startsWith(TRIAL_ERROR_PREFIX)) {
		const message = raw.slice(TRIAL_ERROR_PREFIX.length)
		toast.error(message, {
			action: {
				label: "Upgrade",
				onClick: () => window.location.assign("/pricing"),
			},
		})
		return
	}
	toast.error(raw)
}
