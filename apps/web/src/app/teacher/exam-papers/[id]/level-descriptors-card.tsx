"use client"

import { AlignLeft, CheckCircle2, PenLine } from "lucide-react"
import { useState } from "react"
import { LevelDescriptorsDialog } from "./level-descriptors-dialog"

export function LevelDescriptorsCard({
	examPaperId,
	initialValue,
}: {
	examPaperId: string
	initialValue: string | null
}) {
	const [dialogOpen, setDialogOpen] = useState(false)
	const [savedValue, setSavedValue] = useState(initialValue)

	const hasContent = (savedValue ?? "").length > 0

	return (
		<>
			<div
				role="button"
				tabIndex={0}
				onClick={() => setDialogOpen(true)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") setDialogOpen(true)
				}}
				className={[
					"rounded-xl border p-4 flex flex-col gap-3 transition-colors cursor-pointer",
					hasContent
						? "border-green-500/40 bg-green-500/5"
						: "border-dashed border-border hover:bg-muted/30 hover:border-primary/40",
				].join(" ")}
			>
				{/* Icon + title */}
				<div className="flex items-start gap-2.5">
					{hasContent ? (
						<CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
					) : (
						<AlignLeft className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
					)}
					<div className="min-w-0">
						<p className="text-sm font-medium">Level Descriptors</p>
						<p className="text-xs text-muted-foreground leading-snug">
							Guides marking for level-of-response questions
						</p>
					</div>
				</div>

				{/* Status line */}
				{hasContent ? (
					<div className="flex items-center justify-between gap-2">
						<span className="text-xs font-medium text-green-700 dark:text-green-400">
							Set
						</span>
						<span className="text-xs text-muted-foreground flex items-center gap-1">
							<PenLine className="h-3 w-3" />
							Click to edit
						</span>
					</div>
				) : (
					<p className="text-xs text-muted-foreground flex items-center gap-1">
						<PenLine className="h-3 w-3" />
						Click to add
					</p>
				)}
			</div>

			<LevelDescriptorsDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				examPaperId={examPaperId}
				initialValue={savedValue}
				onSaved={(v) => setSavedValue(v)}
			/>
		</>
	)
}
