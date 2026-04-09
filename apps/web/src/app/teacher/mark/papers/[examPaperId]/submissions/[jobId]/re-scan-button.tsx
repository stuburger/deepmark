"use client"

import { Button } from "@/components/ui/button"
import { retriggerOcr } from "@/lib/marking/mutations"
import { useMutation } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export function ReScanButton({
	jobId,
	examPaperId,
}: {
	jobId: string
	examPaperId: string
}) {
	const router = useRouter()

	const { mutate, isPending } = useMutation({
		mutationFn: () => retriggerOcr(jobId),
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			router.push(
				`/teacher/mark/papers/${examPaperId}/submissions/${result.newJobId}`,
			)
		},
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
