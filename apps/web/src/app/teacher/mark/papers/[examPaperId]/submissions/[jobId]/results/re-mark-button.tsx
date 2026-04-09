"use client"

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { buttonVariants } from "@/components/ui/button-variants"
import { retriggerGrading, retriggerOcr } from "@/lib/marking/mutations"
import { cn } from "@/lib/utils"
import { useMutation } from "@tanstack/react-query"
import { ChevronDown, Loader2, RefreshCw, ScanText } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export function ReMarkButton({
	jobId,
	examPaperId,
}: {
	jobId: string
	examPaperId: string
}) {
	const router = useRouter()

	function navigateToNewJob(newJobId: string) {
		router.push(
			`/teacher/mark/papers/${examPaperId}/submissions/${newJobId}`,
		)
	}

	const gradingMutation = useMutation({
		mutationFn: () => retriggerGrading(jobId),
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			navigateToNewJob(result.newJobId)
		},
		onError: () => toast.error("Failed to re-run marking"),
	})

	const ocrMutation = useMutation({
		mutationFn: () => retriggerOcr(jobId),
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			navigateToNewJob(result.newJobId)
		},
		onError: () => toast.error("Failed to re-run answer detection"),
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
				Re-mark
				<ChevronDown className="h-3 w-3 ml-1 opacity-50" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => gradingMutation.mutate()}>
					<RefreshCw className="h-3.5 w-3.5 mr-2" />
					Re-run marking only
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => ocrMutation.mutate()}>
					<ScanText className="h-3.5 w-3.5 mr-2" />
					Re-run answer detection
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
