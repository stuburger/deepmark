"use client"

import { Button } from "@/components/ui/button"
import { surfaceMarkingError } from "@/lib/billing/error-toast"
import { retriggerOcr } from "@/lib/marking/stages/mutations"
import { useMutation } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

export function ReScanButton({
	jobId,
	onNavigateToJob,
}: {
	jobId: string
	onNavigateToJob: (newJobId: string) => void
}) {
	const { mutate, isPending } = useMutation({
		mutationFn: () => retriggerOcr({ jobId }),
		onSuccess: (result) => {
			if (result?.serverError) {
				surfaceMarkingError(result.serverError)
				return
			}
			if (!result?.data) return
			onNavigateToJob(result.data.newJobId)
		},
		onError: () => surfaceMarkingError("Failed to re-scan"),
	})

	return (
		<Button
			variant="outline"
			size="sm"
			disabled={isPending}
			onClick={() => mutate()}
		>
			{isPending && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
			Re-scan pages
		</Button>
	)
}
