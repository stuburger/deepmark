"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	type CatalogExamPaper,
	listCatalogExamPapers,
} from "@/lib/dashboard-actions"
import { type ExtractedAnswer, triggerGrading } from "@/lib/mark-actions"
import {
	AlertCircle,
	CheckCircle2,
	FileText,
	Loader2,
	Search,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

function subjectBadgeVariant(subject: string) {
	switch (subject) {
		case "biology":
			return "secondary" as const
		case "chemistry":
			return "default" as const
		case "physics":
			return "outline" as const
		case "english":
			return "secondary" as const
		default:
			return "outline" as const
	}
}

/**
 * Lets the teacher search and select an exam paper to mark against,
 * then fires the grading pipeline. After triggering, calls router.refresh()
 * so the parent server component re-derives the phase as marking_in_progress.
 */
export function ExamPaperSelector({
	jobId,
	extractedAnswers,
	studentName,
	detectedSubject,
}: {
	jobId: string
	extractedAnswers: ExtractedAnswer[]
	studentName: string | null
	detectedSubject: string | null
}) {
	const router = useRouter()

	const [papers, setPapers] = useState<CatalogExamPaper[]>([])
	const [loadingPapers, setLoadingPapers] = useState(true)
	const [search, setSearch] = useState("")
	const [selectedPaper, setSelectedPaper] = useState<CatalogExamPaper | null>(
		null,
	)
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [subjectFilterActive, setSubjectFilterActive] = useState(true)

	useEffect(() => {
		listCatalogExamPapers().then((r) => {
			if (r.ok) setPapers(r.papers)
			setLoadingPapers(false)
		})
	}, [])

	const filteredBySubject = papers.filter((p) =>
		detectedSubject && subjectFilterActive
			? p.subject === detectedSubject
			: true,
	)

	const filteredBySearch = (list: CatalogExamPaper[]) => {
		if (!search.trim()) return list
		const q = search.toLowerCase()
		return list.filter(
			(p) =>
				p.title.toLowerCase().includes(q) ||
				p.subject.toLowerCase().includes(q) ||
				(p.exam_board ?? "").toLowerCase().includes(q) ||
				String(p.year).includes(q),
		)
	}

	const visiblePapers = filteredBySearch(filteredBySubject)
	const allMatchingSearch = filteredBySearch(papers)
	const showingFiltered =
		detectedSubject !== null && visiblePapers.length < allMatchingSearch.length

	async function handleMark() {
		if (!selectedPaper) return
		setError(null)
		setSubmitting(true)
		const result = await triggerGrading(jobId, selectedPaper.id)
		if (!result.ok) {
			setError(result.error)
			setSubmitting(false)
			return
		}
		// Refresh so the server re-derives phase as marking_in_progress
		router.refresh()
	}

	return (
		<div className="space-y-6">
			<div>
				<p className="text-sm text-muted-foreground">
					Answers were extracted from this scan — now select the exam paper to
					mark against.
				</p>
				{studentName && extractedAnswers.length > 0 && (
					<div className="mt-2 flex items-center gap-1.5">
						<CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
						<span className="text-sm font-medium">
							{extractedAnswers.length} answers extracted
						</span>
						<Badge variant="outline" className="text-xs ml-1">
							{studentName}
						</Badge>
					</div>
				)}
			</div>

			<div className="space-y-3">
				<h2 className="text-base font-semibold">Select exam paper</h2>

				<div className="relative">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="pl-9"
						placeholder="Search papers…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>

				{showingFiltered && (
					<button
						type="button"
						onClick={() => setSubjectFilterActive(false)}
						className="text-xs text-primary font-medium"
					>
						Show all subjects
					</button>
				)}

				{loadingPapers ? (
					<p className="py-4 text-center text-sm text-muted-foreground">
						Loading papers…
					</p>
				) : visiblePapers.length === 0 ? (
					<p className="py-4 text-center text-sm text-muted-foreground">
						No papers found.{" "}
						{showingFiltered && (
							<button
								type="button"
								onClick={() => setSubjectFilterActive(false)}
								className="text-primary font-medium"
							>
								Show all subjects?
							</button>
						)}
					</p>
				) : (
					<div className="space-y-2">
						{visiblePapers.map((paper) => {
							const isSelected = selectedPaper?.id === paper.id
							return (
								<button
									key={paper.id}
									type="button"
									disabled={!paper.has_mark_scheme}
									onClick={() => setSelectedPaper(paper)}
									className={`w-full rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
										isSelected
											? "border-primary bg-primary/5"
											: "bg-card enabled:hover:bg-muted/50"
									}`}
								>
									<div className="flex items-start justify-between gap-2">
										<p className="text-sm font-medium leading-tight">
											{paper.title}
										</p>
										<div className="flex items-center gap-1 shrink-0">
											{isSelected && (
												<CheckCircle2 className="h-4 w-4 text-primary" />
											)}
											{!paper.has_mark_scheme && (
												<span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
													<AlertCircle className="h-3.5 w-3.5" />
													No mark scheme
												</span>
											)}
										</div>
									</div>
									<div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
										<Badge
											variant={subjectBadgeVariant(paper.subject)}
											className="text-xs"
										>
											{capitalize(paper.subject)}
										</Badge>
										{paper.exam_board && <span>{paper.exam_board}</span>}
										<span>{paper.year}</span>
										<span>{paper.total_marks} marks</span>
									</div>
								</button>
							)
						})}
					</div>
				)}
			</div>

			{error && (
				<div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
					<AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
					<p className="text-sm text-destructive">{error}</p>
				</div>
			)}

			<Button
				size="lg"
				className="w-full"
				disabled={!selectedPaper || submitting}
				onClick={handleMark}
			>
				{submitting ? (
					<Loader2 className="h-4 w-4 mr-2 animate-spin" />
				) : (
					<FileText className="h-4 w-4 mr-2" />
				)}
				{submitting
					? "Starting…"
					: `Mark against ${selectedPaper ? selectedPaper.title : "selected paper"}`}
			</Button>
		</div>
	)
}
