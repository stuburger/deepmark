"use client"

import { Button } from "@/components/ui/button"
import type { StagedFileLabel } from "@/lib/paper-setup/types"
import { Loader2, X } from "lucide-react"

const LABEL_TEXT: Record<StagedFileLabel, string> = {
	question_paper: "Question paper",
	mark_scheme: "Mark scheme",
	stimulus_pack: "Stimulus pack",
	scripts_bundle: "Student scripts",
	unrecognised: "Unrecognised",
}

export type StagedFileRow = {
	clientId: string
	filename: string
	tempUploadId: string | null
	status: "uploading" | "classifying" | "classified" | "error"
	label: StagedFileLabel | null
	error: string | null
}

export function StagedFilesList({
	files,
	onReassign,
	onRemove,
}: {
	files: StagedFileRow[]
	onReassign: (clientId: string, label: StagedFileLabel) => void
	onRemove: (clientId: string) => void
}) {
	if (files.length === 0) return null
	return (
		<ul className="space-y-2">
			{files.map((file) => (
				<li
					key={file.clientId}
					className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
				>
					<div className="min-w-0 flex-1">
						<p className="truncate font-medium text-foreground">
							{file.filename}
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{file.status === "uploading" && "Uploading…"}
							{file.status === "classifying" && "Classifying…"}
							{file.status === "classified" &&
								file.label &&
								LABEL_TEXT[file.label]}
							{file.status === "error" && (file.error ?? "Failed")}
						</p>
					</div>
					{(file.status === "uploading" || file.status === "classifying") && (
						<Loader2 className="size-4 animate-spin text-muted-foreground" />
					)}
					{(file.status === "classified" || file.status === "error") && (
						<select
							aria-label="Reassign file slot"
							className="rounded-md border border-border bg-background px-2 py-1 text-xs"
							value={file.label ?? "unrecognised"}
							onChange={(e) =>
								onReassign(file.clientId, e.target.value as StagedFileLabel)
							}
						>
							<option value="question_paper">Question paper</option>
							<option value="mark_scheme">Mark scheme</option>
							<option value="stimulus_pack">Stimulus pack</option>
							<option value="scripts_bundle">Student scripts</option>
							<option value="unrecognised" disabled>
								Unrecognised
							</option>
						</select>
					)}
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={() => onRemove(file.clientId)}
						aria-label={`Remove ${file.filename}`}
					>
						<X className="size-4" />
					</Button>
				</li>
			))}
		</ul>
	)
}
