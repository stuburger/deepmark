"use client"

import { SubmissionsListTable } from "@/components/marking/submissions-list-table"
import { listBookmarkedSubmissions } from "@/lib/marking/listing/queries"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { parseAsStringLiteral, useQueryState } from "nuqs"

type Row = SubmissionHistoryItem & { version_count: number }

const STATUS_FILTERS = ["all", "marked", "processing", "failed"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const STATUS_LABEL: Record<StatusFilter, string> = {
	all: "All",
	marked: "Marked",
	processing: "Processing",
	failed: "Failed",
}

function matchesStatus(sub: Row, filter: StatusFilter): boolean {
	if (filter === "all") return true
	if (filter === "marked") return sub.status === "ocr_complete"
	if (filter === "failed") return sub.status === "failed"
	// "processing" — anything not in a terminal state
	return sub.status !== "ocr_complete" && sub.status !== "failed"
}

export function BookmarksView({
	initialSubmissions,
}: {
	initialSubmissions: Row[]
}) {
	const router = useRouter()
	const [status, setStatus] = useQueryState(
		"status",
		parseAsStringLiteral(STATUS_FILTERS).withDefault("all"),
	)

	const { data: submissions = initialSubmissions } = useQuery({
		queryKey: queryKeys.bookmarkedSubmissions(),
		queryFn: async () => {
			const r = await listBookmarkedSubmissions()
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data?.submissions ?? []
		},
		initialData: initialSubmissions,
		staleTime: 30_000,
	})

	const filtered = submissions.filter((s) => matchesStatus(s, status))

	return (
		<SubmissionsListTable
			submissions={filtered}
			onView={(id) => router.push(`/teacher/submissions/${id}`)}
			toolbar={
				<div className="flex flex-wrap items-center gap-2">
					{STATUS_FILTERS.map((f) => {
						const isActive = status === f
						return (
							<button
								key={f}
								type="button"
								onClick={() => setStatus(f === "all" ? null : f)}
								className={cn(
									"rounded-md px-3 py-1 text-xs transition-colors",
									isActive
										? "border border-primary bg-primary/15 font-medium text-primary"
										: "border border-border-quiet bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								{STATUS_LABEL[f]}
							</button>
						)
					})}
				</div>
			}
		/>
	)
}
