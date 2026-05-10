export type PaperStatus = "marking" | "review" | "done"

export type DashboardPaper = {
	id: string
	title: string
	subject: string
	scriptCount: number
	status: PaperStatus
	progress: number
}

export type DashboardCounts = {
	review: number
	marking: number
	done: number
}

export type DashboardData = {
	displayName: string
	counts: DashboardCounts
	recentPapers: DashboardPaper[]
}
