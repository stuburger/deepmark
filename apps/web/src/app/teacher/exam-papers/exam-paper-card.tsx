"use client"

import { Badge } from "@/components/ui/badge"
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
	type ExamPaperListItem,
	deleteExamPaper,
} from "@/lib/dashboard-actions"
import { SUBJECT_LABELS, type Subject } from "@/lib/subjects"
import { useMutation } from "@tanstack/react-query"
import { Clock, Globe, Layers, Lock, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

const SUBJECT_COLOURS: Record<string, string> = {
	biology: "bg-green-500",
	chemistry: "bg-orange-500",
	physics: "bg-blue-500",
	english: "bg-rose-500",
	english_literature: "bg-pink-500",
	mathematics: "bg-violet-500",
	history: "bg-amber-600",
	geography: "bg-teal-500",
	computer_science: "bg-cyan-500",
	french: "bg-indigo-500",
	spanish: "bg-yellow-500",
	religious_studies: "bg-purple-500",
	business: "bg-slate-500",
}

function subjectColour(subject: string) {
	return SUBJECT_COLOURS[subject] ?? "bg-muted-foreground"
}

function formatDate(date: Date) {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(new Date(date))
}

export function ExamPaperCard({ paper }: { paper: ExamPaperListItem }) {
	const router = useRouter()
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [hidden, setHidden] = useState(false)

	const { mutate: doDelete, isPending: deleting } = useMutation({
		mutationFn: () => deleteExamPaper(paper.id),
		onMutate: () => {
			// Close modal and hide card immediately — revert in onError if needed
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

	const subjectLabel = SUBJECT_LABELS[paper.subject as Subject] ?? paper.subject
	const colour = subjectColour(paper.subject)
	const paperLabel = paper.paper_number ? `Paper ${paper.paper_number}` : null

	if (hidden) return null

	return (
		<>
			<Card className="group/paper relative flex flex-col gap-0 py-0 hover:ring-foreground/20 transition-shadow cursor-pointer">
				{/* Coloured header band — the "exam paper stripe" */}
				<div className={`h-1.5 ${colour} rounded-t-xl`} />

				<Link
					href={`/teacher/exam-papers/${paper.id}`}
					className="absolute inset-0 rounded-xl"
					aria-label={paper.title}
				/>

				<CardHeader className="pt-4 pb-2">
					<div className="flex items-start justify-between gap-2">
						<Badge variant="outline" className="text-xs font-normal shrink-0">
							{subjectLabel}
						</Badge>
						{paper.is_public ? (
							<Badge variant="default" className="gap-1 text-xs shrink-0">
								<Globe className="h-3 w-3" />
								Public
							</Badge>
						) : (
							<Badge
								variant="outline"
								className="gap-1 text-xs text-muted-foreground shrink-0"
							>
								<Lock className="h-3 w-3" />
								Draft
							</Badge>
						)}
					</div>
					<CardTitle className="text-sm font-semibold leading-snug mt-2 line-clamp-2">
						{paper.title}
					</CardTitle>
					{(paper.exam_board || paper.year || paperLabel) && (
						<p className="text-xs text-muted-foreground mt-0.5">
							{[paper.exam_board, String(paper.year), paperLabel]
								.filter(Boolean)
								.join(" · ")}
						</p>
					)}
				</CardHeader>

				<CardContent className="flex-1 pb-3">
					<div className="border-t border-dashed pt-3 space-y-1.5">
						<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Clock className="h-3.5 w-3.5 shrink-0" />
							<span>{paper.duration_minutes} min</span>
							<span className="mx-1 text-border">·</span>
							<span className="font-medium text-foreground">
								{paper.total_marks}
							</span>
							<span>marks</span>
						</div>
						{paper._count.sections > 0 && (
							<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<Layers className="h-3.5 w-3.5 shrink-0" />
								<span>
									{paper._count.sections}{" "}
									{paper._count.sections === 1 ? "section" : "sections"}
								</span>
							</div>
						)}
					</div>
				</CardContent>

				<CardFooter className="flex items-center justify-between text-xs text-muted-foreground">
					<span>{formatDate(paper.created_at)}</span>
					<button
						type="button"
						onClick={(e) => {
							e.preventDefault()
							e.stopPropagation()
							setConfirmOpen(true)
						}}
						className="relative z-10 opacity-0 group-hover/paper:opacity-100 rounded p-1 text-muted-foreground hover:text-destructive transition-opacity"
						aria-label={`Delete ${paper.title}`}
					>
						<Trash2 className="h-4 w-4" />
					</button>
				</CardFooter>
			</Card>

			<ConfirmDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				title="Delete exam paper?"
				description={`This will permanently delete "${paper.title.length > 50 ? `${paper.title.slice(0, 50)}…` : paper.title}" along with all its questions, mark schemes, and uploaded PDFs. This cannot be undone.`}
				confirmLabel="Delete paper"
				loading={deleting}
				onConfirm={() => doDelete()}
			/>
		</>
	)
}
