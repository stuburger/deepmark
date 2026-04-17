"use client"

import { buttonVariants } from "@/components/ui/button-variants"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { retriggerGrading, retriggerOcr } from "@/lib/marking/mutations"
import { cn } from "@/lib/utils"
import { useMutation } from "@tanstack/react-query"
import {
	ChevronDown,
	Loader2,
	RefreshCw,
	ScanText,
	Sparkles,
} from "lucide-react"
import { toast } from "sonner"

/**
 * Teacher-facing menu to re-run any pipeline stage from a single entry point.
 *
 * The per-pip popovers in `StagePips` also expose stage-specific re-runs, but
 * this dropdown is the discoverable starting point teachers reach for when
 * they know something went wrong but haven't yet looked at individual stages.
 */
export function ReRunMenu({
	jobId,
	onNavigateToJob,
	onReAnnotate,
}: {
	jobId: string
	onNavigateToJob: (newJobId: string) => void
	onReAnnotate?: () => void
}) {
	const gradingMutation = useMutation({
		mutationFn: () => retriggerGrading(jobId),
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			onNavigateToJob(result.newJobId)
		},
		onError: () => toast.error("Failed to re-grade"),
	})

	const ocrMutation = useMutation({
		mutationFn: () => retriggerOcr(jobId),
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			onNavigateToJob(result.newJobId)
		},
		onError: () => toast.error("Failed to re-scan"),
	})

	const isPending = gradingMutation.isPending || ocrMutation.isPending

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={isPending}
				className={cn(
					buttonVariants({ variant: "outline", size: "sm" }),
					isPending && "opacity-60 pointer-events-none",
				)}
			>
				{isPending ? (
					<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
				) : (
					<RefreshCw className="h-3.5 w-3.5 mr-1.5" />
				)}
				Re-run
				<ChevronDown className="h-3 w-3 ml-1 opacity-50" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-auto min-w-0">
				<DropdownMenuItem
					className="whitespace-nowrap"
					onClick={() => ocrMutation.mutate()}
				>
					<ScanText className="h-3.5 w-3.5 mr-2 shrink-0" />
					Re-scan
				</DropdownMenuItem>
				<DropdownMenuItem
					className="whitespace-nowrap"
					onClick={() => gradingMutation.mutate()}
				>
					<RefreshCw className="h-3.5 w-3.5 mr-2 shrink-0" />
					Re-grade
				</DropdownMenuItem>
				{onReAnnotate && (
					<DropdownMenuItem
						className="whitespace-nowrap"
						onClick={onReAnnotate}
					>
						<Sparkles className="h-3.5 w-3.5 mr-2 shrink-0" />
						Re-annotate
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
