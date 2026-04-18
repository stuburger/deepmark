"use client"

import type {
	GradingResult,
	TeacherOverride,
	UpsertTeacherOverrideInput,
} from "@/lib/marking/types"
import { createContext, useContext } from "react"

export type GradingDataContextValue = {
	gradingResults: Map<string, GradingResult>
	answers: Record<string, string>
	overridesByQuestionId: Map<string, TeacherOverride>
	activeQuestionNumber: string | null
	jobId: string
	onAnswerSaved: (questionId: string, text: string) => void
	onOverrideChange: (
		questionId: string,
		input: UpsertTeacherOverrideInput | null,
	) => void
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
