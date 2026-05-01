import { FileScan, MessageSquareText, ScanLine } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const features = [
	{
		icon: ScanLine,
		title: "Scan",
		body: "Upload a scanned PDF. Every page, every script, every question — segmented automatically.",
	},
	{
		icon: FileScan,
		title: "Mark",
		body: "Aligned to AQA assessment objectives (AO1, AO2, AO3). Consistent application of the mark scheme across every script, no drift.",
	},
	{
		icon: MessageSquareText,
		title: "Annotate",
		body: "Examiner-style feedback rendered inline on the original handwriting, with rationale linked to mark points.",
	},
]

export function SageProductSection() {
	return (
		<section className="border-b border-border/40">
			<div className="mx-auto max-w-6xl px-6 py-24">
				<div className="mx-auto max-w-2xl text-center">
					<h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
						Standardised marking, without drift.
					</h2>
					<p className="mt-4 text-base text-muted-foreground">
						Three steps, one workflow. Built around the mark scheme — not around
						the model.
					</p>
				</div>
				<div className="mt-14 grid gap-6 md:grid-cols-3">
					{features.map(({ icon: Icon, title, body }) => (
						<Card key={title} className="border-border/60">
							<CardHeader>
								<Icon className="size-5 text-foreground/70" />
								<CardTitle className="mt-3 text-lg">{title}</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">{body}</p>
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		</section>
	)
}
