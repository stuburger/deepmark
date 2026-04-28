"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { FileText, Sparkles } from "lucide-react"

export type ProcessingStage =
	| { kind: "uploading"; fileName: string }
	| { kind: "extracting"; fileName: string; s3Key: string }

type ProcessingCardProps = {
	sub: ProcessingStage
}

export function ProcessingCard({ sub }: ProcessingCardProps) {
	return (
		<Card>
			<CardContent className="pt-6 pb-6">
				<div className="flex flex-col items-center justify-center py-8 gap-5">
					<div
						className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
							sub.kind === "extracting" ? "bg-primary/10" : "bg-muted"
						}`}
					>
						{sub.kind === "extracting" ? (
							<Sparkles className="h-7 w-7 text-primary" />
						) : (
							<FileText className="h-7 w-7 text-muted-foreground" />
						)}
					</div>
					<div className="text-center space-y-1.5">
						<p className="text-sm font-medium">{sub.fileName}</p>
						<div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
							<Spinner className="h-4 w-4 shrink-0" />
							<span>
								{sub.kind === "uploading"
									? "Uploading…"
									: "Detecting paper details…"}
							</span>
						</div>
						{sub.kind === "extracting" && (
							<p className="text-xs text-muted-foreground">
								DeepMark is reading the cover page and header
							</p>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	)
}
