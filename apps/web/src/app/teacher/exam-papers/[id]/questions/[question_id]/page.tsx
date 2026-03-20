import { Badge } from "@/components/ui/badge"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { getExamPaperDetail, getQuestionDetail } from "@/lib/dashboard-actions"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteQuestionButton } from "./delete-question-button"
import { EvalDialog } from "./eval-dialog"
import { QuestionEditForm } from "./question-edit-form"
import { SimilarQuestionsSection } from "./similar-questions-section"

type MarkPoint = {
	point_number?: number
	description: string
	criteria?: string
	points: number
}

type Level = {
	level: number
	mark_range: [number, number]
	descriptor: string
	ao_requirements?: string[]
}

type MarkingRules = {
	command_word?: string
	items_required?: number
	levels?: Level[]
	caps?: Array<{
		condition: string
		max_level?: number
		max_mark?: number
		reason: string
	}>
}

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

function originLabel(origin: string) {
	switch (origin) {
		case "question_paper":
			return "Question Paper"
		case "mark_scheme":
			return "Mark Scheme PDF"
		case "exemplar":
			return "Exemplar"
		case "manual":
			return "Manual"
		default:
			return capitalize(origin)
	}
}

function markingMethodLabel(method: string) {
	switch (method) {
		case "point_based":
			return "Point-based"
		case "level_of_response":
			return "Level of response"
		case "deterministic":
			return "Multiple choice"
		default:
			return capitalize(method)
	}
}

function formatDate(date: Date) {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(new Date(date))
}

export default async function QuestionDetailPage({
	params,
}: {
	params: Promise<{ id: string; question_id: string }>
}) {
	const { id: examPaperId, question_id: questionId } = await params
	const [result, paperResult] = await Promise.all([
		getQuestionDetail(questionId),
		getExamPaperDetail(examPaperId),
	])
	if (!result.ok) notFound()

	const { question } = result
	const paperQuestions = paperResult.ok
		? paperResult.paper.questions.map((q) => ({
				id: q.id,
				text: q.text,
				question_number: q.question_number,
				origin: q.origin,
				mark_scheme_status: q.mark_scheme_status,
				mark_scheme_id: q.mark_scheme_id,
				mark_scheme_description: q.mark_scheme_description,
			}))
		: []

	return (
		<div className="space-y-6 max-w-3xl">
			{/* Back link */}
			<div>
				<Link
					href={`/teacher/exam-papers/${examPaperId}`}
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← Back to exam paper
				</Link>
			</div>

			{/* Question card */}
			<Card>
				<CardHeader>
					<div className="flex items-start justify-between gap-2">
						<div className="flex flex-wrap gap-2">
							{question.question_number && (
								<Badge variant="outline" className="font-mono">
									Q{question.question_number}
								</Badge>
							)}
							<Badge variant="secondary">{capitalize(question.subject)}</Badge>
							<Badge variant="outline">
								{question.question_type === "multiple_choice"
									? "Multiple choice"
									: "Written"}
							</Badge>
							<Badge variant="outline">{originLabel(question.origin)}</Badge>
							{question.topic && question.topic !== question.subject && (
								<Badge variant="outline">{question.topic}</Badge>
							)}
						</div>
						<div className="flex items-center gap-1 shrink-0">
							<EvalDialog questionId={question.id} />
							<DeleteQuestionButton
								questionId={question.id}
								examPaperId={examPaperId}
							/>
						</div>
					</div>
					<p className="text-xs text-muted-foreground">
						Added {formatDate(question.created_at)}
					</p>
				</CardHeader>
				<CardContent className="space-y-4">
					<QuestionEditForm
						questionId={question.id}
						initialText={question.text}
						initialPoints={question.points}
						initialQuestionNumber={question.question_number}
					/>

					{/* Multiple choice options */}
					{question.question_type === "multiple_choice" &&
						question.multiple_choice_options.length > 0 && (
							<div className="space-y-1.5">
								<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
									Options
								</p>
								<div className="space-y-1">
									{question.multiple_choice_options.map((opt) => (
										<div
											key={opt.option_label}
											className="flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm"
										>
											<span className="shrink-0 font-medium w-4">
												{opt.option_label}
											</span>
											<span>{opt.option_text}</span>
										</div>
									))}
								</div>
							</div>
						)}
				</CardContent>
			</Card>

			{/* Mark schemes */}
			{question.mark_schemes.length === 0 ? (
				<Card>
					<CardContent className="py-8 text-center text-sm text-muted-foreground">
						No mark scheme yet. Upload a mark scheme PDF to populate this.
					</CardContent>
				</Card>
			) : (
				question.mark_schemes.map((ms, idx) => {
					const markPoints = Array.isArray(ms.mark_points)
						? (ms.mark_points as MarkPoint[])
						: []
					const rules =
						ms.marking_method === "level_of_response" && ms.marking_rules
							? (ms.marking_rules as MarkingRules)
							: null

					return (
						<Card key={ms.id}>
							<CardHeader>
								<div className="flex items-center justify-between gap-2">
									<CardTitle className="text-base">
										Mark scheme
										{question.mark_schemes.length > 1 ? ` ${idx + 1}` : ""}
									</CardTitle>
									<div className="flex items-center gap-2">
										<Badge variant="outline">
											{markingMethodLabel(ms.marking_method)}
										</Badge>
										<Badge variant="secondary">
											{ms.points_total} mark{ms.points_total !== 1 ? "s" : ""}
										</Badge>
									</div>
								</div>
								{ms.description && (
									<CardDescription className="mt-1 whitespace-pre-wrap">
										{ms.description}
									</CardDescription>
								)}
							</CardHeader>

							{(ms.marking_method === "deterministic" ||
								markPoints.length > 0 ||
								ms.guidance ||
								rules) && (
								<CardContent className="space-y-4">
									{/* Multiple choice correct answer */}
									{ms.marking_method === "deterministic" && (
										<div className="flex items-center gap-3 rounded-lg border border-green-500/40 bg-green-500/5 px-3 py-2.5 text-sm">
											<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
												Correct answer
											</span>
											<span className="font-semibold text-green-700 dark:text-green-400">
												{ms.correct_option_labels.join(", ") || "—"}
											</span>
										</div>
									)}

									{/* Point-based mark points */}
									{ms.marking_method !== "level_of_response" &&
										ms.marking_method !== "deterministic" &&
										markPoints.length > 0 && (
											<div>
												<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
													Mark points
												</p>
												<div className="space-y-2">
													{markPoints.map((mp, i) => (
														<div
															key={i}
															className="flex items-start gap-3 rounded-lg border p-3 text-sm"
														>
															<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
																{mp.point_number ?? i + 1}
															</span>
															<div className="min-w-0 flex-1">
																<p>{mp.description}</p>
																{mp.criteria &&
																	mp.criteria !== mp.description && (
																		<p className="mt-1 text-xs text-muted-foreground">
																			{mp.criteria}
																		</p>
																	)}
															</div>
															<span className="shrink-0 text-xs text-muted-foreground">
																{mp.points}m
															</span>
														</div>
													))}
												</div>
											</div>
										)}

									{/* Level of response descriptors */}
									{rules?.levels && rules.levels.length > 0 && (
										<div>
											<div className="flex items-center gap-3 mb-2">
												<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
													Level descriptors
												</p>
												{rules.command_word && (
													<Badge variant="outline" className="text-xs">
														{rules.command_word}
													</Badge>
												)}
												{rules.items_required && (
													<span className="text-xs text-muted-foreground">
														{rules.items_required} item
														{rules.items_required !== 1 ? "s" : ""} required
													</span>
												)}
											</div>
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead className="w-16">Level</TableHead>
														<TableHead className="w-20">Marks</TableHead>
														<TableHead>Descriptor</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{[...rules.levels].reverse().map((level) => (
														<TableRow key={level.level}>
															<TableCell className="font-medium">
																{level.level}
															</TableCell>
															<TableCell className="text-muted-foreground">
																{level.mark_range[0]}–{level.mark_range[1]}
															</TableCell>
															<TableCell className="whitespace-pre-wrap text-sm">
																{level.descriptor}
																{level.ao_requirements &&
																	level.ao_requirements.length > 0 && (
																		<ul className="mt-1 list-disc list-inside text-xs text-muted-foreground space-y-0.5">
																			{level.ao_requirements.map((ao, j) => (
																				<li key={j}>{ao}</li>
																			))}
																		</ul>
																	)}
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>

											{rules.caps && rules.caps.length > 0 && (
												<div className="mt-3 space-y-1">
													<p className="text-xs font-medium text-muted-foreground">
														Caps
													</p>
													{rules.caps.map((cap, i) => (
														<p
															key={i}
															className="text-xs text-amber-700 dark:text-amber-300"
														>
															{cap.condition} → max{" "}
															{cap.max_level != null
																? `Level ${cap.max_level}`
																: `${cap.max_mark} marks`}{" "}
															({cap.reason})
														</p>
													))}
												</div>
											)}
										</div>
									)}

									{/* Guidance */}
									{ms.guidance && (
										<>
											<Separator />
											<div>
												<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
													Guidance
												</p>
												<p className="text-sm whitespace-pre-wrap leading-relaxed">
													{ms.guidance}
												</p>
											</div>
										</>
									)}
								</CardContent>
							)}
						</Card>
					)
				})
			)}

			{/* Duplicate detection */}
			{paperQuestions.length > 1 && (
				<SimilarQuestionsSection
					questionId={question.id}
					examPaperId={examPaperId}
					questions={paperQuestions}
					currentQuestion={{
						id: question.id,
						text: question.text,
						question_number: question.question_number,
						origin: question.origin,
						mark_scheme_id: question.mark_schemes[0]?.id ?? null,
						mark_scheme_description:
							question.mark_schemes[0]?.description ?? null,
					}}
				/>
			)}
		</div>
	)
}
