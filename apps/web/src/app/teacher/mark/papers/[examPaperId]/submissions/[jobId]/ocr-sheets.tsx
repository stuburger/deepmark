"use client"

import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet"
import type { ScanPageUrl } from "@/lib/mark-actions"
import { FileText, StickyNote } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

type SheetButtonProps = {
	trigger: ReactElement
	title: string
	children: ReactNode
}

function OcrSheet({ trigger, title, children }: SheetButtonProps) {
	return (
		<Sheet>
			<SheetTrigger render={trigger} />
			<SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
				</SheetHeader>
				<div className="flex-1 overflow-y-auto px-4 pb-6 space-y-6">
					{children}
				</div>
			</SheetContent>
		</Sheet>
	)
}

export function TranscriptSheet({
	trigger,
	scanPages,
}: {
	trigger: ReactElement
	scanPages: ScanPageUrl[]
}) {
	const pagesWithAnalysis = scanPages.filter((p) => p.analysis)

	return (
		<OcrSheet trigger={trigger} title="OCR Transcript">
			{pagesWithAnalysis.length === 0 ? (
				<p className="text-sm text-muted-foreground italic">
					No transcript available yet.
				</p>
			) : (
				pagesWithAnalysis.map((page) => (
					<div key={page.order}>
						{scanPages.length > 1 && (
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
								Page {page.order}
							</p>
						)}
						<div className="flex items-start gap-2 mb-1.5">
							<FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								Transcript
							</p>
						</div>
						<p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground rounded-md bg-muted/50 px-3 py-2.5">
							{page.analysis?.transcript || "—"}
						</p>
					</div>
				))
			)}
		</OcrSheet>
	)
}

export function ObservationsSheet({
	trigger,
	scanPages,
}: {
	trigger: ReactElement
	scanPages: ScanPageUrl[]
}) {
	const pagesWithAnalysis = scanPages.filter((p) => p.analysis)

	return (
		<OcrSheet trigger={trigger} title="OCR Observations">
			{pagesWithAnalysis.length === 0 ? (
				<p className="text-sm text-muted-foreground italic">
					No observations available yet.
				</p>
			) : (
				pagesWithAnalysis.map((page) => (
					<div key={page.order}>
						{scanPages.length > 1 && (
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
								Page {page.order}
							</p>
						)}
						<div className="flex items-start gap-2 mb-1.5">
							<StickyNote className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								Observations
							</p>
						</div>
						{(page.analysis?.observations ?? []).length > 0 ? (
							<ul className="list-disc list-inside space-y-1 text-sm leading-relaxed text-foreground rounded-md bg-muted/50 px-3 py-2.5">
								{(page.analysis?.observations ?? []).map((obs, i) => (
									<li key={i}>{obs}</li>
								))}
							</ul>
						) : (
							<p className="text-sm text-muted-foreground rounded-md bg-muted/50 px-3 py-2.5">
								—
							</p>
						)}
					</div>
				))
			)}
		</OcrSheet>
	)
}
