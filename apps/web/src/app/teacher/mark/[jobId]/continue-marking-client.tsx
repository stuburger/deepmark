"use client"

import { ExamPaperPanel } from "@/components/ExamPaperPanel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	type CatalogExamPaper,
	listCatalogExamPapers,
} from "@/lib/dashboard-actions"
import {
	type ExtractedAnswer,
	type GradingResult,
	getStudentPaperJob,
	triggerGrading,
} from "@/lib/mark-actions"
import {
	AlertCircle,
	CheckCircle2,
	FileText,
	Loader2,
	Search,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

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

export function ContinueMarkingClient({
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
	const [grading, setGrading] = useState(false)
	const [gradingError, setGradingError] = useState<string | null>(null)
	const [pollStatus, setPollStatus] = useState<string | null>(null)
	const [liveGradingResults, setLiveGradingResults] = useState<GradingResult[]>(
		[],
	)
	const isGradingRef = useRef(false)

	useEffect(() => {
		listCatalogExamPapers().then((r) => {
			if (r.ok) setPapers(r.papers)
			setLoadingPapers(false)
		})
	}, [])

	const filteredPapers = papers.filter((p) => {
		const matchesSubject = detectedSubject
			? p.subject === detectedSubject
			: true
		if (!search.trim()) return matchesSubject
		const q = search.toLowerCase()
		return (
			matchesSubject &&
			(p.title.toLowerCase().includes(q) ||
				p.subject.toLowerCase().includes(q) ||
				(p.exam_board ?? "").toLowerCase().includes(q) ||
				String(p.year).includes(q))
		)
	})

	const allPapers = papers.filter((p) => {
		if (!search.trim()) return true
		const q = search.toLowerCase()
		return (
			p.title.toLowerCase().includes(q) ||
			p.subject.toLowerCase().includes(q) ||
			(p.exam_board ?? "").toLowerCase().includes(q) ||
			String(p.year).includes(q)
		)
	})

	const showingFiltered =
		detectedSubject !== null && filteredPapers.length < allPapers.length
	const [subjectFilterActive, setSubjectFilterActive] = useState(true)

	const visiblePapers = subjectFilterActive ? filteredPapers : allPapers

	const pollGrading = useCallback(async () => {
		const result = await getStudentPaperJob(jobId)
		if (!result.ok) return
		const { status, grading_results } = result.data
		setPollStatus(status)
		if (grading_results.length > liveGradingResults.length) {
			setLiveGradingResults(grading_results)
		}
		if (status === "ocr_complete") {
			router.push(`/teacher/mark/${jobId}`)
		}
		if (status === "failed") {
			setGradingError(result.data.error ?? "Marking failed")
			setGrading(false)
			isGradingRef.current = false
		}
	}, [jobId, router, liveGradingResults.length])

	useEffect(() => {
		if (!grading) return
		const interval = setInterval(pollGrading, 2000)
		return () => clearInterval(interval)
	}, [grading, pollGrading])

	async function handleMark() {
		if (!selectedPaper) return
		setGradingError(null)
		setGrading(true)
		isGradingRef.current = true
		const result = await triggerGrading(jobId, selectedPaper.id)
		if (!result.ok) {
			setGradingError(result.error)
			setGrading(false)
			isGradingRef.current = false
		}
	}

	if (grading) {
		return (
			<div className="max-w-2xl space-y-3">
				<div className="flex items-center gap-2">
					<Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
					<div>
						<p className="text-sm font-semibold">Marking answers…</p>
						{selectedPaper && (
							<p className="text-xs text-muted-foreground">
								{selectedPaper.title}
							</p>
						)}
					</div>
				</div>
				<ExamPaperPanel
					gradingResults={liveGradingResults}
					extractedAnswers={extractedAnswers}
					isGrading={pollStatus !== "ocr_complete"}
					examPaperTitle={selectedPaper?.title}
				/>
				{gradingError && (
					<p className="text-sm text-destructive">{gradingError}</p>
				)}
			</div>
		)
	}

	return (
		<div className="max-w-2xl space-y-6">
			<div>
				<p className="text-sm text-muted-foreground mb-1">
					Answers were extracted from this scan — now select the exam paper to
					mark against.
				</p>
			</div>

			{extractedAnswers.length > 0 && (
				<div>
					<div className="flex items-center gap-2 mb-2">
						<CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
						<span className="text-sm font-medium">Answers extracted</span>
						<div className="flex items-center gap-1.5 ml-auto">
							{studentName && (
								<Badge variant="outline" className="text-xs">
									{studentName}
								</Badge>
							)}
							{detectedSubject && (
								<Badge
									variant={subjectBadgeVariant(detectedSubject)}
									className="text-xs capitalize"
								>
									{capitalize(detectedSubject.replace("_", " "))}
								</Badge>
							)}
						</div>
					</div>
					<ExamPaperPanel
						gradingResults={[]}
						extractedAnswers={extractedAnswers}
					/>
				</div>
			)}

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

				{showingFiltered && subjectFilterActive && (
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
						{showingFiltered && subjectFilterActive && (
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

			{gradingError && (
				<div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
					<AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
					<p className="text-sm text-destructive">{gradingError}</p>
				</div>
			)}

			<Button
				size="lg"
				className="w-full"
				disabled={!selectedPaper}
				onClick={handleMark}
			>
				<FileText className="h-4 w-4 mr-2" />
				Mark against {selectedPaper ? selectedPaper.title : "selected paper"}
			</Button>
		</div>
	)
}
