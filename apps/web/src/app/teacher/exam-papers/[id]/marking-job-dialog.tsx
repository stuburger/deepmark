"use client"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
	getJobPageTokens,
	getJobScanPageUrls,
	getStudentPaperJobForPaper,
} from "@/lib/mark-actions"
import type {
	PageToken,
	ScanPageUrl,
	StudentPaperJobPayload,
} from "@/lib/mark-actions"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { derivePhase } from "../../mark/[jobId]/shared/phase"
import type { MarkingPhase } from "../../mark/[jobId]/shared/phase"
import { SubmissionView } from "../../mark/papers/[examPaperId]/submissions/[jobId]/submission-view"

type DialogData = {
	data: StudentPaperJobPayload
	scanPages: ScanPageUrl[]
	pageTokens: PageToken[]
	phase: MarkingPhase
}

export function MarkingJobDialog({
	examPaperId,
	jobId,
	open,
	onOpenChange,
}: {
	examPaperId: string
	jobId: string | null
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const [loading, setLoading] = useState(false)
	const [dialogData, setDialogData] = useState<DialogData | null>(null)

	useEffect(() => {
		if (!jobId || !open) {
			setDialogData(null)
			return
		}

		let cancelled = false
		setLoading(true)

		async function fetchData() {
			if (!jobId) return
			const [result, scanResult, tokensResult] = await Promise.all([
				getStudentPaperJobForPaper(examPaperId, jobId),
				getJobScanPageUrls(jobId),
				getJobPageTokens(jobId),
			])

			if (cancelled) return

			if (!result.ok) {
				setLoading(false)
				return
			}

			setDialogData({
				data: result.data,
				scanPages: scanResult.ok ? scanResult.pages : [],
				pageTokens: tokensResult.ok ? tokensResult.tokens : [],
				phase: derivePhase(result.data),
			})
			setLoading(false)
		}

		void fetchData()
		return () => {
			cancelled = true
		}
	}, [jobId, open, examPaperId])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[98vw] h-[98vh] p-0 overflow-hidden">
				{loading || !dialogData || !jobId ? (
					<div className="flex h-full items-center justify-center">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					</div>
				) : (
					<SubmissionView
						mode="dialog"
						examPaperId={examPaperId}
						jobId={jobId}
						initialData={dialogData.data}
						scanPages={dialogData.scanPages}
						pageTokens={dialogData.pageTokens}
						initialPhase={dialogData.phase}
					/>
				)}
			</DialogContent>
		</Dialog>
	)
}
