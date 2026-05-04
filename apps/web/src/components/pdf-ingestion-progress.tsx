import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { CheckCircle2 } from "lucide-react"

export type PdfIngestionDocumentType =
	| "mark_scheme"
	| "exemplar"
	| "question_paper"
	| "student_paper"

type ProcessingStep = { label: string; detail: string; progress: number }

export const PDF_INGESTION_STATUS_STEPS: Record<string, ProcessingStep> = {
	pending: { label: "Queued", detail: "Waiting to start…", progress: 10 },
	processing: {
		label: "Reading PDF",
		detail: "Extracting questions and criteria…",
		progress: 35,
	},
	text_extracted: {
		label: "Text extracted",
		detail: "Preparing structured extraction…",
		progress: 50,
	},
	extracting: {
		label: "Extracting data",
		detail: "Structuring questions and mark points…",
		progress: 70,
	},
	extracted: {
		label: "Finalising",
		detail: "Saving and running quality checks…",
		progress: 90,
	},
	ocr_complete: { label: "Complete", detail: "All done!", progress: 100 },
}

export function PdfIngestionProgressView({
	status,
	documentType,
}: {
	status: string | null
	documentType: PdfIngestionDocumentType
}) {
	const step = status
		? (PDF_INGESTION_STATUS_STEPS[status] ?? PDF_INGESTION_STATUS_STEPS.pending)
		: PDF_INGESTION_STATUS_STEPS.pending
	const docLabel =
		documentType === "mark_scheme"
			? "mark scheme"
			: documentType === "question_paper"
				? "question paper"
				: documentType === "student_paper"
					? "student paper"
					: "exemplar"

	return (
		<div className="space-y-4 py-2">
			<div className="flex items-center gap-3">
				{step.progress === 100 ? (
					<CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
				) : (
					<Spinner className="h-5 w-5 shrink-0" />
				)}
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium">{step.label}</p>
					<p className="text-xs text-muted-foreground">{step.detail}</p>
				</div>
			</div>
			<Progress value={step.progress} className="h-2" />
			<div className="space-y-1.5">
				{Object.entries(PDF_INGESTION_STATUS_STEPS)
					.filter(([key]) => key !== "ocr_complete")
					.map(([key, s]) => {
						const isComplete = s.progress < step.progress
						const isActive = s.progress === step.progress
						return (
							<div key={key} className="flex items-center gap-2 text-xs">
								<span
									className={`h-1.5 w-1.5 shrink-0 rounded-full ${
										isComplete
											? "bg-success"
											: isActive
												? "bg-primary"
												: "bg-muted-foreground/30"
									}`}
								/>
								<span
									className={
										isComplete
											? "text-muted-foreground line-through"
											: isActive
												? "font-medium"
												: "text-muted-foreground/50"
									}
								>
									{s.label}
								</span>
							</div>
						)
					})}
			</div>
			<p className="text-xs text-muted-foreground">
				Processing your {docLabel} PDF. Usually takes 30–90 seconds
				{documentType === "mark_scheme"
					? " (longer if adversarial checks run)."
					: "."}
			</p>
		</div>
	)
}
