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
import { ChevronDown, History } from "lucide-react"

function formatDate(date: Date): string {
	const d = new Date(date)
	const day = String(d.getDate()).padStart(2, "0")
	const month = d.toLocaleDateString("en-GB", { month: "short" })
	const time = d.toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
	})
	return `${day} ${month}, ${time}`
}

function versionLabel(
	version: SubmissionVersion,
	index: number,
	total: number,
): string {
	const vNum = total - index
	if (version.superseded_at === null) return `v${vNum} (latest)`
	if (version.supersede_reason) return `v${vNum} · ${version.supersede_reason}`
	return `v${vNum}`
}

export function VersionSwitcher({
	jobId,
	onVersionChange,
}: {
	jobId: string
	onVersionChange: (newJobId: string) => void
}) {
	const { data: versions } = useQuery({
		queryKey: queryKeys.jobVersions(jobId),
		queryFn: async () => {
			const r = await getSubmissionVersions(jobId)
			return r.ok ? r.versions : []
		},
		staleTime: 30_000,
	})

	if (!versions || versions.length <= 1) return null

	const currentIndex = versions.findIndex((v) => v.id === jobId)
	const current = versions[currentIndex]
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
			<DropdownMenuContent align="start" className="w-auto min-w-0">
				{versions.map((v, i) => {
					const label = versionLabel(v, i, versions.length)
					const isCurrent = v.id === jobId
					return (
						<DropdownMenuItem
							key={v.id}
							disabled={isCurrent}
							onClick={() => {
								if (!isCurrent) onVersionChange(v.id)
							}}
							className={`whitespace-nowrap ${isCurrent ? "font-medium" : ""}`}
						>
							<span>{label}</span>
							<span className="ml-auto text-muted-foreground pl-4 tabular-nums text-[11px]">
								{formatDate(v.created_at)}
							</span>
						</DropdownMenuItem>
					)
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
