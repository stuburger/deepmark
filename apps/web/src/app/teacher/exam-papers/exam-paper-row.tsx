"use client"

import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell, TableRow } from "@/components/ui/table"
import { deleteExamPaper } from "@/lib/exam-paper/mutations"
import type { ExamPaperListItem } from "@/lib/exam-paper/queries"
import { useMutation } from "@tanstack/react-query"
import { Globe, Lock, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

function subjectVariant(subject: string): BadgeVariant {
	switch (subject) {
		case "biology":
			return "secondary"
		case "chemistry":
			return "default"
		case "physics":
			return "outline"
		case "english":
			return "secondary"
		case "business":
			return "outline"
		default:
			return "outline"
	}
}

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDate(date: Date) {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(new Date(date))
}

function truncate(s: string, max = 40) {
	return s.length > max ? `${s.slice(0, max)}…` : s
}

export function ExamPaperRow({ paper }: { paper: ExamPaperListItem }) {
	const router = useRouter()
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [hidden, setHidden] = useState(false)

	const { mutate: doDelete, isPending: deleting } = useMutation({
		mutationFn: () => deleteExamPaper(paper.id),
		onMutate: () => {
			setConfirmOpen(false)
			setHidden(true)
		},
		onSuccess: (result) => {
			if (!result.ok) {
				setHidden(false)
				toast.error(result.error)
				return
			}
			router.refresh()
		},
		onError: () => {
			setHidden(false)
			toast.error("Failed to delete exam paper")
		},
	})

	if (hidden) return null

	return (
		<>
			<TableRow className="cursor-pointer hover:bg-muted/50 group">
				<TableCell className="font-medium max-w-70">
					<Link
						href={`/teacher/exam-papers/${paper.id}`}
						className="block truncate hover:underline underline-offset-4"
						title={paper.title}
					>
						{truncate(paper.title)}
					</Link>
				</TableCell>
				<TableCell>
					<Badge variant={subjectVariant(paper.subject)}>
						{capitalize(paper.subject)}
					</Badge>
				</TableCell>
				<TableCell className="text-center">
					{paper.paper_number ?? "—"}
				</TableCell>
				<TableCell className="text-center">{paper.total_marks}</TableCell>
				<TableCell className="text-center">
					{paper.duration_minutes} min
				</TableCell>
				<TableCell>
					{paper.is_public ? (
						<Badge variant="default" className="gap-1">
							<Globe className="h-3 w-3" /> Public
						</Badge>
					) : (
						<Badge variant="outline" className="gap-1 text-muted-foreground">
							<Lock className="h-3 w-3" /> Draft
						</Badge>
					)}
				</TableCell>
				<TableCell className="text-muted-foreground">
					{formatDate(paper.created_at)}
				</TableCell>
				<TableCell className="w-8 text-right">
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation()
							setConfirmOpen(true)
						}}
						className="opacity-0 group-hover:opacity-100 rounded p-1 text-muted-foreground hover:text-destructive transition-opacity"
						aria-label={`Delete ${paper.title}`}
					>
						<Trash2 className="h-4 w-4" />
					</button>
				</TableCell>
			</TableRow>

			<ConfirmDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				title="Delete exam paper?"
				description={`This will permanently delete "${truncate(paper.title, 50)}" along with all its questions, mark schemes, and uploaded PDFs. This cannot be undone.`}
				confirmLabel="Delete paper"
				loading={deleting}
				onConfirm={() => doDelete()}
			/>
		</>
	)
}
