// ─── Usage Analytics Types ───────────────────────────────────────────────────

export type UsageByStage = {
	stage: string
	prompt_tokens: number
	completion_tokens: number
}

export type UsageByCallSite = {
	call_site: string
	stage: string
	prompt_tokens: number
	completion_tokens: number
}

export type UsageByModel = {
	model: string
	provider: string
	prompt_tokens: number
	completion_tokens: number
	estimated_cost: number
}

export type UsageByDate = {
	date: string
	ocr_tokens: number
	grading_tokens: number
	annotation_tokens: number
}

export type UsageByUser = {
	user_id: string
	user_name: string
	user_email: string
	papers_marked: number
	total_tokens: number
	prompt_tokens: number
	completion_tokens: number
	estimated_cost: number
}

export type RecentRun = {
	id: string
	completed_at: string
	student_name: string
	paper_title: string
	stage: string
	model: string
	total_calls: number
	prompt_tokens: number
	completion_tokens: number
	call_sites: {
		call_site: string
		prompt_tokens: number
		completion_tokens: number
	}[]
}

export type UsageSummary = {
	total_tokens: number
	total_prompt_tokens: number
	total_completion_tokens: number
	estimated_cost: number
	papers_marked: number
	avg_tokens_per_paper: number
}

export type UsageAnalyticsData = {
	summary: UsageSummary
	byStage: UsageByStage[]
	byCallSite: UsageByCallSite[]
	byModel: UsageByModel[]
	byDate: UsageByDate[]
	byUser: UsageByUser[]
	recentRuns: RecentRun[]
}
