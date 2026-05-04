"use client"

import { toast } from "sonner"

import { BALANCE_ERROR_PREFIX } from "./types"

/**
 * Detect whether an error carries the insufficient-balance sentinel and
 * extract the human-readable portion. Pure helper so the cap-bite modal and
 * the toast helper share the same parser — sentinel changes can never
 * silently drift between the two surfaces.
 */
export function parseInsufficientBalanceError(
	input: string | Error | null | undefined,
):
	| { isInsufficientBalance: true; message: string }
	| { isInsufficientBalance: false } {
	if (!input) return { isInsufficientBalance: false }
	const raw = typeof input === "string" ? input : input.message
	if (raw.startsWith(BALANCE_ERROR_PREFIX)) {
		return {
			isInsufficientBalance: true,
			message: raw.slice(BALANCE_ERROR_PREFIX.length),
		}
	}
	return { isInsufficientBalance: false }
}

/**
 * Surface a server error from a marking-trigger action.
 *
 * If the message carries the insufficient-balance sentinel (set by
 * `handleServerError` for `InsufficientBalanceError`), strip it and render a
 * sonner toast with an "Upgrade" action button that takes the user to
 * /pricing. Otherwise render a plain error toast.
 *
 * Accepts either a serverError string (next-safe-action shape) or an Error
 * instance (TanStack Query's `onError` arg). Ignores nullish input.
 *
 * Use the toast for single-script actions (re-mark, re-scan). Batch commits
 * should escalate to the cap-bite modal — see `<CapBiteModal>`.
 */
export function surfaceMarkingError(input: string | Error | null | undefined) {
	if (!input) return
	const parsed = parseInsufficientBalanceError(input)
	if (parsed.isInsufficientBalance) {
		toast.error(parsed.message, {
			action: {
				label: "Upgrade",
				onClick: () => window.location.assign("/pricing"),
			},
		})
		return
	}
	const raw = typeof input === "string" ? input : input.message
	toast.error(raw)
}
