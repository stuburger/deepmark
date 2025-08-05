import { GetExamPaperStatisticsSchema } from "./schema"
import { exam_papers } from "../../db/collections/exam-papers"
import { exam_sessions } from "../../db/collections/exam-sessions"
import { answers } from "../../db/collections/answers"
import { question_parts } from "../../db/collections/question-parts"
import { ObjectId } from "mongodb"
import { tool } from "@/tools/shared/tool-utils"

export const handler = tool(GetExamPaperStatisticsSchema, async (args) => {
	const { exam_paper_id, include_detailed_breakdown } = args

	console.log("[get-exam-paper-statistics] Handler invoked", {
		exam_paper_id,
		include_detailed_breakdown,
	})

	// Validate ObjectId format
	if (!ObjectId.isValid(exam_paper_id)) {
		throw new Error("Invalid exam paper ID format")
	}

	const examPaperObjectId = new ObjectId(exam_paper_id)

	// Get exam paper details
	const examPaper = await exam_papers.findOne({ _id: examPaperObjectId })

	if (!examPaper) {
		throw new Error(`Exam paper with ID ${exam_paper_id} not found`)
	}

	// Get all sessions for this exam paper
	const sessions = await exam_sessions
		.find({ exam_paper_id: examPaperObjectId })
		.toArray()

	// Get all answers for this exam paper
	const sessionIds = sessions.map((s) => s._id.toString())
	const allAnswers = await answers
		.find({ exam_session_id: { $in: sessionIds } })
		.toArray()

	// Gather all question IDs in the paper
	const allQuestionIds = examPaper.sections.flatMap(
		(section) => section.questions,
	)

	// Fetch all question parts for these questions
	const allQuestionParts = await question_parts
		.find({ question_id: { $in: allQuestionIds } })
		.toArray()
	const partsByQuestion = new Map()
	allQuestionParts.forEach((part) => {
		if (!partsByQuestion.has(part.question_id))
			partsByQuestion.set(part.question_id, [])
		partsByQuestion.get(part.question_id).push(part)
	})

	// Calculate basic statistics
	const totalSessions = sessions.length
	const completedSessions = sessions.filter(
		(s) => s.status === "completed",
	).length
	const inProgressSessions = sessions.filter(
		(s) => s.status === "in_progress",
	).length
	const abandonedSessions = sessions.filter(
		(s) => s.status === "abandoned",
	).length

	// Calculate score statistics for completed sessions
	const completedSessionsWithScores = sessions.filter(
		(s) => s.status === "completed" && s.total_score !== undefined,
	)

	let averageScore = 0
	let highestScore = 0
	let lowestScore = 0
	let scoreDistribution = {}

	if (completedSessionsWithScores.length > 0) {
		const scores = completedSessionsWithScores.map((s) => s.total_score!)
		const percentages = completedSessionsWithScores.map(
			(s) => (s.total_score! / s.max_possible_score) * 100,
		)

		averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length
		highestScore = Math.max(...scores)
		lowestScore = Math.min(...scores)

		// Calculate score distribution (by percentage ranges)
		const distribution = {
			"90-100%": 0,
			"80-89%": 0,
			"70-79%": 0,
			"60-69%": 0,
			"50-59%": 0,
			"40-49%": 0,
			"30-39%": 0,
			"20-29%": 0,
			"10-19%": 0,
			"0-9%": 0,
		}

		percentages.forEach((percentage) => {
			if (percentage >= 90) distribution["90-100%"]++
			else if (percentage >= 80) distribution["80-89%"]++
			else if (percentage >= 70) distribution["70-79%"]++
			else if (percentage >= 60) distribution["60-69%"]++
			else if (percentage >= 50) distribution["50-59%"]++
			else if (percentage >= 40) distribution["40-49%"]++
			else if (percentage >= 30) distribution["30-39%"]++
			else if (percentage >= 20) distribution["20-29%"]++
			else if (percentage >= 10) distribution["10-19%"]++
			else distribution["0-9%"]++
		})
		scoreDistribution = distribution
	}

	// Calculate completion time statistics
	const completedSessionsWithTime = sessions.filter(
		(s) => s.status === "completed" && s.completed_at,
	)

	let averageCompletionTime = 0
	let fastestCompletion = 0
	let slowestCompletion = 0

	if (completedSessionsWithTime.length > 0) {
		const completionTimes = completedSessionsWithTime.map((session) => {
			const duration =
				session.completed_at!.getTime() - session.started_at.getTime()
			return Math.round(duration / 60000) // Convert to minutes
		})

		averageCompletionTime =
			completionTimes.reduce((sum, time) => sum + time, 0) /
			completionTimes.length
		fastestCompletion = Math.min(...completionTimes)
		slowestCompletion = Math.max(...completionTimes)
	}

	// Calculate answer statistics
	const totalAnswers = allAnswers.length
	const markedAnswers = allAnswers.filter(
		(a) => a.marking_status === "completed",
	).length
	const pendingAnswers = allAnswers.filter(
		(a) => a.marking_status === "pending",
	).length

	const result: any = {
		exam_paper_id,
		exam_paper_title: examPaper.title,
		subject: examPaper.subject,
		year: examPaper.year,
		total_marks: examPaper.total_marks,
		duration_minutes: examPaper.duration_minutes,
		session_statistics: {
			total_sessions: totalSessions,
			completed_sessions: completedSessions,
			in_progress_sessions: inProgressSessions,
			abandoned_sessions: abandonedSessions,
			completion_rate:
				totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0,
		},
		score_statistics: {
			average_score: Math.round(averageScore * 100) / 100,
			highest_score: highestScore,
			lowest_score: lowestScore,
			average_percentage:
				completedSessionsWithScores.length > 0
					? Math.round((averageScore / examPaper.total_marks) * 100 * 100) / 100
					: 0,
			score_distribution: scoreDistribution,
		},
		time_statistics: {
			average_completion_time_minutes:
				Math.round(averageCompletionTime * 100) / 100,
			fastest_completion_minutes: fastestCompletion,
			slowest_completion_minutes: slowestCompletion,
		},
		answer_statistics: {
			total_answers: totalAnswers,
			marked_answers: markedAnswers,
			pending_answers: pendingAnswers,
			marking_completion_rate:
				totalAnswers > 0 ? (markedAnswers / totalAnswers) * 100 : 0,
		},
	}

	if (include_detailed_breakdown) {
		// Calculate section-wise statistics, including question parts
		const sectionStatistics = examPaper.sections.map((section) => {
			const sectionQuestionIds = new Set(section.questions)
			const sectionAnswers = allAnswers.filter((answer) =>
				sectionQuestionIds.has(answer.question_id),
			)

			// Gather all parts for questions in this section
			const sectionParts = allQuestionParts.filter((part) =>
				sectionQuestionIds.has(part.question_id),
			)
			const sectionPartIds = new Set(sectionParts.map((p) => p._id.toString()))

			// Answers for question parts in this section
			const sectionPartAnswers = sectionAnswers.filter(
				(a) => a.question_part_id && sectionPartIds.has(a.question_part_id),
			)
			// Answers for whole questions in this section
			const sectionWholeAnswers = sectionAnswers.filter(
				(a) => !a.question_part_id,
			)

			const markedSectionAnswers = sectionAnswers.filter(
				(a) => a.marking_status === "completed",
			)
			const totalSectionMarks = markedSectionAnswers.reduce(
				(sum, a) => sum + (a.total_score || 0),
				0,
			)
			const maxSectionMarks = markedSectionAnswers.reduce(
				(sum, a) => sum + a.max_possible_score,
				0,
			)

			// Per-question and per-part breakdown
			const questionsBreakdown = Array.from(sectionQuestionIds).map(
				(questionId) => {
					// Whole question answers
					const qAnswers = sectionWholeAnswers.filter(
						(a) => a.question_id === questionId,
					)
					// Parts for this question
					const qParts = partsByQuestion.get(questionId) || []
					// Per-part answers
					const partsBreakdown = qParts.map((part: any) => {
						const partAnswers = sectionPartAnswers.filter(
							(a) => a.question_part_id === part._id.toString(),
						)
						const markedPartAnswers = partAnswers.filter(
							(a) => a.marking_status === "completed",
						)
						return {
							part_id: part._id.toString(),
							part_label: part.part_label,
							text: part.text,
							points: part.points,
							difficulty_level: part.difficulty_level,
							total_answers: partAnswers.length,
							marked_answers: markedPartAnswers.length,
							average_score:
								markedPartAnswers.length > 0
									? Math.round(
											(markedPartAnswers.reduce(
												(sum: number, a: any) => sum + (a.total_score || 0),
												0,
											) /
												markedPartAnswers.length /
												(part.points || 1)) *
												100,
										) / 100
									: 0,
						}
					})
					// Whole question stats
					const markedQAnswers = qAnswers.filter(
						(a) => a.marking_status === "completed",
					)
					return {
						question_id: questionId,
						total_answers: qAnswers.length,
						marked_answers: markedQAnswers.length,
						average_score:
							markedQAnswers.length > 0
								? Math.round(
										(markedQAnswers.reduce(
											(sum: number, a: any) => sum + (a.total_score || 0),
											0,
										) /
											markedQAnswers.length /
											(qParts.length === 0
												? 1
												: qParts.reduce(
														(sum: number, p: any) => sum + (p.points || 1),
														0,
													))) *
											100,
									) / 100
								: 0,
						parts: partsBreakdown,
					}
				},
			)

			return {
				section_id: section._id.toString(),
				title: section.title,
				total_questions: section.questions.length,
				total_answers: sectionAnswers.length,
				marked_answers: markedSectionAnswers.length,
				average_score:
					markedSectionAnswers.length > 0
						? Math.round((totalSectionMarks / maxSectionMarks) * 100 * 100) /
							100
						: 0,
				total_marks: section.total_marks,
				questions: questionsBreakdown,
				total_parts: sectionParts.length,
			}
		})

		result.section_breakdown = sectionStatistics
	}

	console.log(
		"[get-exam-paper-statistics] Statistics calculated successfully",
		{
			examPaperId: exam_paper_id,
			totalSessions,
			completedSessions,
			averageScore,
		},
	)

	// Format the result as a readable string
	let summary = `<ExamPaperStatistics>`
	summary += `<ExamPaper>`
	summary += `<Title>${result.exam_paper_title}</Title>`
	summary += `<Subject>${result.subject}</Subject>`
	summary += `<Year>${result.year}</Year>`
	summary += `<TotalMarks>${result.total_marks}</TotalMarks>`
	summary += `<DurationMinutes>${result.duration_minutes}</DurationMinutes>`
	summary += `</ExamPaper>`

	summary += `<SessionStatistics>`
	summary += `<TotalSessions>${result.session_statistics.total_sessions}</TotalSessions>`
	summary += `<Completed>${result.session_statistics.completed_sessions}</Completed>`
	summary += `<InProgress>${result.session_statistics.in_progress_sessions}</InProgress>`
	summary += `<Abandoned>${result.session_statistics.abandoned_sessions}</Abandoned>`
	summary += `<CompletionRate>${result.session_statistics.completion_rate.toFixed(
		2,
	)}</CompletionRate>`
	summary += `</SessionStatistics>`

	summary += `<ScoreStatistics>`
	summary += `<AverageScore>${result.score_statistics.average_score}</AverageScore>`
	summary += `<HighestScore>${result.score_statistics.highest_score}</HighestScore>`
	summary += `<LowestScore>${result.score_statistics.lowest_score}</LowestScore>`
	summary += `<AveragePercentage>${result.score_statistics.average_percentage}</AveragePercentage>`
	summary += `<ScoreDistribution>${JSON.stringify(
		result.score_statistics.score_distribution,
	)}</ScoreDistribution>`
	summary += `</ScoreStatistics>`

	summary += `<TimeStatistics>`
	summary += `<AverageCompletionTimeMinutes>${result.time_statistics.average_completion_time_minutes}</AverageCompletionTimeMinutes>`
	summary += `<FastestCompletionMinutes>${result.time_statistics.fastest_completion_minutes}</FastestCompletionMinutes>`
	summary += `<SlowestCompletionMinutes>${result.time_statistics.slowest_completion_minutes}</SlowestCompletionMinutes>`
	summary += `</TimeStatistics>`

	summary += `<AnswerStatistics>`
	summary += `<TotalAnswers>${result.answer_statistics.total_answers}</TotalAnswers>`
	summary += `<Marked>${result.answer_statistics.marked_answers}</Marked>`
	summary += `<Pending>${result.answer_statistics.pending_answers}</Pending>`
	summary += `<MarkingCompletionRate>${result.answer_statistics.marking_completion_rate.toFixed(
		2,
	)}</MarkingCompletionRate>`
	summary += `</AnswerStatistics>`

	if (include_detailed_breakdown && result.section_breakdown) {
		summary += `<SectionBreakdown>`
		for (const section of result.section_breakdown) {
			summary += `<Section id="${section.section_id}">`
			summary += `<Title>${section.title}</Title>`
			summary += `<TotalQuestions>${section.total_questions}</TotalQuestions>`
			summary += `<TotalParts>${section.total_parts}</TotalParts>`
			summary += `<TotalAnswers>${section.total_answers}</TotalAnswers>`
			summary += `<MarkedAnswers>${section.marked_answers}</MarkedAnswers>`
			summary += `<AverageScore>${section.average_score}</AverageScore>`
			summary += `<TotalMarks>${section.total_marks}</TotalMarks>`
			if (section.questions) {
				summary += `<Questions>`
				for (const q of section.questions) {
					summary += `<Question id="${q.question_id}">`
					summary += `<TotalAnswers>${q.total_answers}</TotalAnswers>`
					summary += `<MarkedAnswers>${q.marked_answers}</MarkedAnswers>`
					summary += `<AverageScore>${q.average_score}</AverageScore>`
					if (q.parts && q.parts.length > 0) {
						summary += `<Parts>`
						for (const part of q.parts) {
							summary += `<Part id="${part.part_id}">`
							summary += `<Label>${part.part_label}</Label>`
							summary += `<Text>${part.text}</Text>`
							summary += `<Points>${part.points}</Points>`
							summary += `<Difficulty>${part.difficulty_level}</Difficulty>`
							summary += `<TotalAnswers>${part.total_answers}</TotalAnswers>`
							summary += `<MarkedAnswers>${part.marked_answers}</MarkedAnswers>`
							summary += `<AverageScore>${part.average_score}</AverageScore>`
							summary += `</Part>`
						}
						summary += `</Parts>`
					}
					summary += `</Question>`
				}
				summary += `</Questions>`
			}
			summary += `</Section>`
		}
		summary += `</SectionBreakdown>`
	}

	summary += `</ExamPaperStatistics>`

	return text(summary)
})
