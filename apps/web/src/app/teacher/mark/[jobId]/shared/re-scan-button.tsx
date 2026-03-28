"use client"

import { Button } from "@/components/ui/button"
import { retriggerOcr } from "@/lib/mark-actions"
import { queryKeys } from "@/lib/query-keys"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

export function ReScanButton({ jobId }: { jobId: string }) {
	const queryClient = useQueryClient()

	const { mutate, isPending, error } = useMutation({
		mutationFn: () => retriggerOcr(jobId),
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			void queryClient.invalidateQueries({
				queryKey: queryKeys.studentJob(jobId),
			})
		},
	})

	return (
		<div className="flex flex-col items-start gap-1">
			<Button
				variant="outline"
				size="sm"
				disabled={isPending}
				onClick={() => mutate()}
			>
				{isPending && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
				Re-scan pages
			</Button>
			{error && <p className="text-xs text-destructive">{error.message}</p>}
		</div>
	)
}
