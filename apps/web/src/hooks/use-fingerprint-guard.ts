"use client"

import { useCallback, useRef } from "react"

/**
 * Returns a function that returns `true` ("skip — same as before") when
 * called with a value whose fingerprint matches the previous call's.
 *
 * The shape we use this for: a PM editor transaction listener (or similar
 * high-frequency callback) that derives a value and forwards it to a
 * setter / onChange. Without dedup, every transaction allocates a new
 * derived value with a new identity, triggers a re-render in the
 * consumer, and (when the consumer's render path can dispatch more
 * transactions) tips over React's update-depth budget. Calling
 * `if (isDuplicate(derived)) return` before firing the callback breaks
 * that loop without changing the imperative shape of the handler.
 *
 * The returned function is identity-stable (`useCallback` with `[]` and
 * a fingerprint ref), so it can be safely passed to / from effects
 * without re-binding them.
 *
 * Sites this consolidates:
 *  - `useDerivedAnnotations` (string fingerprint over annotation rows)
 *  - `CommentSidebar.recompute` (string fingerprint over comment cards)
 *
 * NOT a fit for `handleTokenHighlight`'s Set dedup — that one runs
 * inside a functional `setState` (the comparison happens at the React
 * setter level, not before firing an external callback). Different shape
 * altogether; left alone.
 */
export function useFingerprintGuard<T>(
	fingerprint: (value: T) => string,
): (value: T) => boolean {
	const prevRef = useRef<string>("")
	const fingerprintRef = useRef(fingerprint)
	fingerprintRef.current = fingerprint

	return useCallback((value: T) => {
		const fp = fingerprintRef.current(value)
		if (fp === prevRef.current) return true
		prevRef.current = fp
		return false
	}, [])
}
