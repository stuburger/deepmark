"use client"

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getSubmissionVersions } from "@/lib/marking/submissions/queries"
import type { SubmissionVersion } from "@/lib/marking/submissions/queries"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, Clock, History } from "lucide-react"
import { useRouter } from "next/navigation"

function formatDate(date: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(date))
}

function versionLabel(
	version: SubmissionVersion,
	index: number,
	total: number,
): string {
	const vNum = total - index
	if (version.superseded_at === null) return `v${vNum} (latest)`
	return `v${vNum}`
}

export function VersionSwitcher({
	examPaperId,
	jobId,
}: {
	examPaperId: string
	jobId: string
}) {
	const router = useRouter()

	const { data: versions } = useQuery({
		queryKey: queryKeys.jobVersions(jobId),
		queryFn: async () => {
			const r = await getSubmissionVersions(jobId)
			return r.ok ? r.versions : []
		},
		staleTime: 30_000,
	})

	if (!versions || versions.length <= 1) return null

	const current = versions.find((v) => v.id === jobId)
	const currentIndex = versions.findIndex((v) => v.id === jobId)
	const currentLabel = current
		? versionLabel(current, currentIndex, versions.length)
		: "—"

	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
				<History className="h-3 w-3" />
				{currentLabel}
				<ChevronDown className="h-3 w-3 opacity-50" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				{versions.map((v, i) => {
					const label = versionLabel(v, i, versions.length)
					const isCurrent = v.id === jobId
					return (
						<DropdownMenuItem
							key={v.id}
							disabled={isCurrent}
							onClick={() => {
								if (!isCurrent) {
									router.push(
										`/teacher/mark/papers/${examPaperId}/submissions/${v.id}`,
									)
								}
							}}
							className={isCurrent ? "font-medium" : ""}
						>
							<div className="flex items-center gap-2 w-full">
								<span>{label}</span>
								<span className="ml-auto flex items-center gap-1 text-muted-foreground">
									<Clock className="h-3 w-3" />
									{formatDate(v.created_at)}
								</span>
							</div>
						</DropdownMenuItem>
					)
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
