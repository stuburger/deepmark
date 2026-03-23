"use client"

import { buttonVariants } from "@/components/ui/button-variants"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ScanPageUrl, StudentPaperJobPayload } from "@/lib/mark-actions"
import { cn } from "@/lib/utils"
import { PlusCircle, ScanText } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { DigitalTabContent } from "./digital-tab-content"
import { AnnotatedScanColumn } from "./phases/results/annotated-scan-column"
import { DownloadPdfButton } from "./phases/results/download-pdf-button"
import { ReMarkButton } from "./phases/results/re-mark-button"
import { StudentNameEditor } from "./phases/results/student-name-editor"
import type { MarkingPhase } from "./shared/phase"
import { ReScanButton } from "./shared/re-scan-button"

function defaultTabForPhase(phase: MarkingPhase): string {
	switch (phase) {
		case "paper_setup":
		case "completed":
		case "failed":
		case "cancelled":
			return "digital"
		default:
			return "scan"
	}
}

export function UnifiedMarkingLayout({
	jobId,
	data,
	scanPages,
	phase,
}: {
	jobId: string
	data: StudentPaperJobPayload
	scanPages: ScanPageUrl[]
	phase: MarkingPhase
}) {
	const [showHighlights, setShowHighlights] = useState(false)

	return (
		<div className="-m-6 flex flex-col overflow-hidden h-dvh">
			{/* Sticky header */}
			<div className="shrink-0 flex items-center gap-3 border-b bg-background px-4 py-2 flex-wrap">
				<Link
					href="/teacher/mark"
					className="text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4 shrink-0"
				>
					← Mark history
				</Link>
				<Separator orientation="vertical" className="h-4 shrink-0" />
				<StudentNameEditor jobId={jobId} initialName={data.student_name} />
				{data.exam_paper_title && (
					<>
						<Separator orientation="vertical" className="h-4 shrink-0" />
						<p className="text-sm text-muted-foreground truncate max-w-xs">
							{data.exam_paper_title}
						</p>
					</>
				)}

				<div className="ml-auto flex items-center gap-2 shrink-0 flex-wrap">
					{scanPages.length > 0 && (
						<button
							type="button"
							onClick={() => setShowHighlights((v) => !v)}
							className={cn(
								buttonVariants({ variant: "outline", size: "sm" }),
								showHighlights &&
									"bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground",
							)}
						>
							<ScanText className="h-3.5 w-3.5 mr-2" />
							OCR overlay
						</button>
					)}

					{phase === "completed" && (
						<>
							<DownloadPdfButton data={data} />
							<ReMarkButton jobId={jobId} />
							<Link
								href="/teacher/mark/new"
								className={buttonVariants({ size: "sm" })}
							>
								<PlusCircle className="h-3.5 w-3.5 mr-1.5" />
								Mark another
							</Link>
						</>
					)}

					{data.pages_count > 0 &&
						(phase === "scan_processing" ||
							phase === "paper_setup" ||
							phase === "failed") && <ReScanButton jobId={jobId} />}
				</div>
			</div>

			{/* Tab bar + scrollable content */}
			<Tabs
				defaultValue={defaultTabForPhase(phase)}
				className="flex-1 flex flex-col min-h-0 overflow-hidden gap-0"
			>
				<TabsList
					variant="line"
					className="shrink-0 w-full justify-start rounded-none border-b px-4 h-9 gap-4"
				>
					<TabsTrigger value="scan">Scan</TabsTrigger>
					<TabsTrigger value="digital">Digital</TabsTrigger>
				</TabsList>

				<TabsContent
					value="scan"
					className="flex-1 overflow-y-auto bg-muted/20 m-0 p-0"
				>
					<AnnotatedScanColumn
						pages={scanPages}
						showHighlights={showHighlights}
						gradingResults={data.grading_results}
					/>
				</TabsContent>

				<TabsContent value="digital" className="flex-1 overflow-y-auto m-0">
					<div className="p-4 space-y-5 max-w-2xl">
						<DigitalTabContent jobId={jobId} data={data} phase={phase} />
					</div>
				</TabsContent>
			</Tabs>
		</div>
	)
}
