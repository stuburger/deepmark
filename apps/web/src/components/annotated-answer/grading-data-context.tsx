"use client"

import type { GradingResult, TeacherOverride } from "@/lib/marking/types"
import { createContext, useContext } from "react"

/**
 * Read-side state for NodeViews. Doc-mutating operations live in
 * `DocOpsContext` (see `doc-ops-context.tsx`); this context is purely
 * "current grading state" — no callbacks.
 */
export type GradingDataContextValue = {
	gradingResults: Map<string, GradingResult>
	answers: Record<string, string>
	overridesByQuestionId: Map<string, TeacherOverride>
	activeQuestionNumber: string | null
	jobId: string
	onAnswerSaved: (questionId: string, text: string) => void
}

const GradingDataContext = createContext<GradingDataContextValue | null>(null)

export const GradingDataProvider = GradingDataContext.Provider

export function useGradingData(): GradingDataContextValue {
	const ctx = useContext(GradingDataContext)
	if (!ctx) {
		throw new Error("useGradingData must be used within a GradingDataProvider")
	}
	return ctx
}
