"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell, TableRow } from "@/components/ui/table"
import { deleteExamPaper } from "@/lib/exam-paper/paper/mutations"
import type { ExamPaperListItem } from "@/lib/exam-paper/types"
import { useMutation } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
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
		mutationFn: () => deleteExamPaper({ id: paper.id }),
		onMutate: () => {
			setConfirmOpen(false)
			setHidden(true)
		},
		onSuccess: (result) => {
			if (result?.serverError) {
				setHidden(false)
				toast.error(result.serverError)
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
				<TableCell className="text-muted-foreground">
					{formatDate(paper.created_at)}
				</TableCell>
				<TableCell className="w-8 text-right">
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={(e) => {
							e.stopPropagation()
							setConfirmOpen(true)
						}}
						className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
						aria-label={`Delete ${paper.title}`}
					>
						<Trash2 className="h-4 w-4" />
					</Button>
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
