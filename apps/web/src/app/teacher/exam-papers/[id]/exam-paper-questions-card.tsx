import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import type { ExamPaperDetail } from "@/lib/exam-paper/types"
import { naturalCompare } from "@/lib/utils"
import {
	ArrowUpDown,
	ChevronDown,
	ChevronUp,
	LayoutList,
	ScrollText,
} from "lucide-react"
import { useState } from "react"
import {
	ExtractionWarningIndicator,
	TableRowDeleteButton,
	originBadgeVariant,
	originLabel,
	schemeBadge,
} from "./exam-paper-helpers"
import { ExamPaperPaperView } from "./exam-paper-paper-view"
import { GradeBoundariesCard } from "./grade-boundaries-card"

type SortKey = "number" | "marks" | "similarity"
type SortDir = "asc" | "desc"

export function ExamPaperQuestionsCard({
	paper,
	similarPairs,
}: {
	paper: ExamPaperDetail
	similarPairs: Array<{ questionId: string; similarToId: string }>
}) {
	const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
		key: "number",
		dir: "asc",
	})
	const [view, setView] = useState<"table" | "paper">("paper")

	function toggleSort(key: SortKey) {
		setSort((prev) =>
			prev.key === key
				? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
				: { key, dir: "asc" },
		)
	}

	const allQuestions = paper.sections.flatMap((s) =>
		s.questions.map((q) => ({ ...q, section_title: s.title })),
	)

	const duplicateIds = new Set(
		similarPairs.flatMap((p) => [p.questionId, p.similarToId]),
	)

	const sortedQuestions = [...allQuestions].sort((a, b) => {
		let cmp = 0
		if (sort.key === "number") {
			cmp = naturalCompare(a.question_number, b.question_number)
			if (cmp === 0) cmp = a.order - b.order
		} else if (sort.key === "marks") {
			const pa = a.points ?? -1
			const pb = b.points ?? -1
			cmp = pa - pb
		} else if (sort.key === "similarity") {
			const aDup = duplicateIds.has(a.id) ? 0 : 1
			const bDup = duplicateIds.has(b.id) ? 0 : 1
			cmp = aDup - bDup
			if (cmp === 0) {
				const aPairId =
					similarPairs.find(
						(p) => p.questionId === a.id || p.similarToId === a.id,
					)?.questionId ?? ""
				const bPairId =
					similarPairs.find(
						(p) => p.questionId === b.id || p.similarToId === b.id,
					)?.questionId ?? ""
				cmp = aPairId.localeCompare(bPairId)
			}
			if (cmp === 0) cmp = naturalCompare(a.question_number, b.question_number)
		}
		return sort.dir === "asc" ? cmp : -cmp
	})

	return (
		<Card>
			<CardHeader>
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-center gap-1 rounded-md border p-0.5 shrink-0">
						<button
							type="button"
							title="Exam paper view"
							onClick={() => setView("paper")}
							className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
								view === "paper"
									? "bg-background shadow-sm text-foreground"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<ScrollText className="h-3.5 w-3.5" />
							Paper
						</button>
						<button
							type="button"
							title="Table view"
							onClick={() => setView("table")}
							className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
								view === "table"
									? "bg-background shadow-sm text-foreground"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<LayoutList className="h-3.5 w-3.5" />
							Table
						</button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<GradeBoundariesCard
					paperId={paper.id}
					subject={paper.subject}
					paperTotal={paper.total_marks}
					tier={paper.tier}
					boundaries={paper.grade_boundaries}
					mode={paper.grade_boundary_mode}
				/>
				{view === "paper" ? (
					<ExamPaperPaperView paper={paper} paperId={paper.id} />
				) : allQuestions.length === 0 ? (
					<div className="py-8 text-center text-sm text-muted-foreground">
						No questions yet. Upload a question paper or mark scheme PDF to
						populate this paper.
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-16">
									<button
										type="button"
										className="flex items-center gap-1 text-xs font-medium hover:text-foreground"
										onClick={() => toggleSort("number")}
									>
										#
										{sort.key === "number" ? (
											sort.dir === "asc" ? (
												<ChevronUp className="h-3 w-3" />
											) : (
												<ChevronDown className="h-3 w-3" />
											)
										) : (
											<ArrowUpDown className="h-3 w-3 opacity-40" />
										)}
									</button>
								</TableHead>
								<TableHead>Section</TableHead>
								<TableHead>Question</TableHead>
								<TableHead>Source</TableHead>
								<TableHead>
									<button
										type="button"
										className="flex items-center gap-1 text-xs font-medium hover:text-foreground"
										onClick={() => toggleSort("marks")}
									>
										Marks
										{sort.key === "marks" ? (
											sort.dir === "asc" ? (
												<ChevronUp className="h-3 w-3" />
											) : (
												<ChevronDown className="h-3 w-3" />
											)
										) : (
											<ArrowUpDown className="h-3 w-3 opacity-40" />
										)}
									</button>
								</TableHead>
								<TableHead>Mark scheme</TableHead>
								<TableHead className="w-8">
									<button
										type="button"
										className="flex items-center gap-1 text-xs font-medium hover:text-foreground"
										onClick={() => toggleSort("similarity")}
										title="Sort by similarity to group potential duplicates"
									>
										<ArrowUpDown
											className={`h-3 w-3 ${
												sort.key === "similarity" ? "" : "opacity-40"
											}`}
										/>
									</button>
								</TableHead>
								<TableHead className="w-10" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{sortedQuestions.map((q) => {
								const isDuplicate = duplicateIds.has(q.id)
								return (
									<TableRow key={q.id} className="group">
										<TableCell className="text-muted-foreground">
											<div className="flex items-center gap-1.5">
												{isDuplicate && (
													<span
														className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
														title="Potential duplicate"
													/>
												)}
												<span className="tabular-nums">
													{q.question_number ?? q.order}
												</span>
											</div>
										</TableCell>
										<TableCell className="text-muted-foreground text-xs">
											{q.section_title}
										</TableCell>
										<TableCell className="max-w-xs">
											<p className="truncate text-sm" title={q.text}>
												{q.text}
											</p>
										</TableCell>
										<TableCell>
											<Badge variant={originBadgeVariant(q.origin)}>
												{originLabel(q.origin)}
											</Badge>
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-1.5">
												<span>{q.points ?? "—"}</span>
												{q.extraction_warning && (
													<ExtractionWarningIndicator
														questionId={q.id}
														message={q.extraction_warning}
													/>
												)}
											</div>
										</TableCell>
										<TableCell>{schemeBadge(q.mark_scheme_status)}</TableCell>
										<TableCell />
										<TableCell>
											<div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
												<TableRowDeleteButton
													questionId={q.id}
													paperId={paper.id}
												/>
											</div>
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	)
}
