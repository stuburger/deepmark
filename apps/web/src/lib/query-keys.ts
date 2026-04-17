export const queryKeys = {
	examPapers: () => ["examPapers"] as const,
	examPaper: (id: string) => ["examPaper", id] as const,
	examPaperLiveState: (id: string) => ["examPaperLiveState", id] as const,
	similarQuestions: (id: string) => ["similarQuestions", id] as const,
	unlinkedMarkSchemes: (id: string) => ["unlinkedMarkSchemes", id] as const,
	examPaperStats: (id: string) => ["examPaperStats", id] as const,
	submissions: (examPaperId: string) => ["submissions", examPaperId] as const,
	studentJob: (jobId: string) => ["studentJob", jobId] as const,
	jobStages: (jobId: string) => ["jobStages", jobId] as const,
	jobScanUrls: (jobId: string) => ["jobScanUrls", jobId] as const,
	jobPageTokens: (jobId: string) => ["jobPageTokens", jobId] as const,
	jobAnnotations: (jobId: string) => ["jobAnnotations", jobId] as const,
	jobVersions: (jobId: string) => ["jobVersions", jobId] as const,
	teacherOverrides: (submissionId: string) =>
		["teacherOverrides", submissionId] as const,
	ingestionJob: (jobId: string) => ["ingestionJob", jobId] as const,
	catalogExamPapers: () => ["catalogExamPapers"] as const,
	llmCallSites: () => ["llmCallSites"] as const,
	submissionFeedback: (submissionId: string) =>
		["submissionFeedback", submissionId] as const,
}
