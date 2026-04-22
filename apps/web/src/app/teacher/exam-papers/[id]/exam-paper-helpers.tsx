"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { StagedScript } from "@/lib/batch/types"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { useDeleteQuestion } from "./hooks/use-exam-paper-mutations"

export function schemeBadge(status: string | null) {
	if (!status) return <Badge variant="destructive">No scheme</Badge>
	switch (status) {
		case "linked":
		case "auto_linked":
			return <Badge variant="secondary">Has scheme</Badge>
		case "unlinked":
			return <Badge variant="destructive">Unlinked</Badge>
		default:
			return <Badge variant="outline">{status}</Badge>
	}
}

export function originBadgeVariant(origin: string) {
	switch (origin) {
		case "question_paper":
			return "default" as const
		case "mark_scheme":
			return "secondary" as const
		default:
			return "outline" as const
	}
}

export function originLabel(origin: string) {
	switch (origin) {
		case "question_paper":
			return "Question Paper"
		case "mark_scheme":
			return "Mark Scheme"
		case "exemplar":
			return "Exemplar"
		case "manual":
			return "Manual"
		default:
			return origin
	}
}

export function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Script confidence display helpers ───────────────────────────────────────
//
// Shared by all components that render a StagedScript confidence badge.

export function confidenceBadgeVariant(
	confidence: StagedScript["confidence"],
): "default" | "destructive" | "outline" | "secondary" {
	if (confidence === null) return "secondary"
	if (confidence >= 0.9) return "default"
	if (confidence >= 0.7) return "outline"
	return "destructive"
}

export function confidenceLabel(
	confidence: StagedScript["confidence"],
): string {
	if (confidence === null) return "—"
	return (Math.round(confidence * 10) / 10).toFixed(1)
}

// ─── Page thumbnail dimensions ───────────────────────────────────────────────
//
// A4 aspect ratio thumbnail used across the staging review UI.
// Tailwind equivalent: w-[200px] h-[283px] (or w-50 / h-[283px]).

export const PAGE_THUMB_W = 200
export const PAGE_THUMB_H = 283

export function TableRowDeleteButton({
	questionId,
	paperId,
}: {
	questionId: string
	paperId: string
}) {
	const [confirmOpen, setConfirmOpen] = useState(false)
	const { mutate: doDelete, isPending: deleting } = useDeleteQuestion(paperId)

	return (
		<>
			<Button
				size="sm"
				variant="ghost"
				className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
				title="Delete question"
				onClick={(e) => {
					e.stopPropagation()
					setConfirmOpen(true)
				}}
			>
				<Trash2 className="h-3.5 w-3.5" />
				<span className="sr-only">Delete question</span>
			</Button>
			<ConfirmDialog
				open={confirmOpen}
				onOpenChange={(next) => {
					if (!deleting) setConfirmOpen(next)
				}}
				title="Delete this question?"
				description="This will permanently remove the question, its mark scheme, and all associated data. This cannot be undone."
				confirmLabel={deleting ? "Deleting…" : "Delete question"}
				loading={deleting}
				onConfirm={() =>
					doDelete(questionId, { onSuccess: () => setConfirmOpen(false) })
				}
			/>
		</>
	)
}
