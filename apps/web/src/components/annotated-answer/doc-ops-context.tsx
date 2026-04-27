"use client"

import type { UpsertTeacherOverrideInput } from "@/lib/marking/types"
import { type Context, createContext, useContext } from "react"

/**
 * Single ingress point for every doc-mutating operation invoked from
 * NodeViews (score override, feedback bullets, future ops).
 *
 * Replaces the previous fan-out of `onOverrideChange` / `onFeedbackBulletsSave`
 * callbacks through `submission-view → results-panel → results/index →
 * grading-results-panel → GradingDataContext`. NodeViews now read this
 * context directly via `useDocOps()`, so adding a new doc-edit op is a
 * one-file change.
 *
 * `GradingDataContext` keeps the read-side state (current PG-projected
 * overrides, grading results) — this context is only writes.
 *
 * The context lives in this file (consumer side); the provider lives in
 * `./doc-ops-provider.tsx` so that NodeViews don't transitively import the
 * `"use server"` mutations module — which is fine in a Next.js bundle but
 * trips Vitest because `server-only` is a deliberately-unresolvable tripwire.
 */
export type DocOps = {
	/**
	 * Save (input non-null) or clear (input null) the teacher score / feedback
	 * override for a question. Optimistically updates the React Query cache;
	 * the doc dispatch is awaited via `withSubmissionEditor`.
	 */
	saveOverride: (
		questionId: string,
		input: UpsertTeacherOverrideInput | null,
	) => void
	/**
	 * Replace the WWW (`whatWentWell`) and / or EBI (`evenBetterIf`) bullet
	 * lists on a question. The doc is the source of truth; Hocuspocus echoes
	 * the new attrs back to the editor within ms.
	 */
	saveFeedbackBullets: (
		questionId: string,
		patch: { whatWentWell?: string[]; evenBetterIf?: string[] },
	) => void
}

export const DocOpsContext: Context<DocOps | null> =
	createContext<DocOps | null>(null)

export function useDocOps(): DocOps {
	const ctx = useContext(DocOpsContext)
	if (!ctx) {
		throw new Error("useDocOps must be used within a DocOpsProvider")
	}
	return ctx
}
