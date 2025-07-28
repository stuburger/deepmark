import { CompareExamPapersSchema } from "./schema";
import { exam_papers } from "../../db/collections/exam-papers";
import { exam_sessions } from "../../db/collections/exam-sessions";
import { answers } from "../../db/collections/answers";
import { ObjectId } from "mongodb";
import { tool, json } from "../tool-utils";

export const handler = tool(CompareExamPapersSchema, async (args) => {
  const { exam_paper_ids, comparison_metrics } = args;

  console.log("[compare-exam-papers] Handler invoked", {
    exam_paper_ids,
    comparison_metrics,
  });

  // Validate ObjectId formats
  for (const examPaperId of exam_paper_ids) {
    if (!ObjectId.isValid(examPaperId)) {
      throw new Error(`Invalid exam paper ID format: ${examPaperId}`);
    }
  }

  const examPaperObjectIds = exam_paper_ids.map((id) => new ObjectId(id));

  // Get exam paper details
  const examPapers = await exam_papers
    .find({ _id: { $in: examPaperObjectIds } })
    .toArray();

  if (examPapers.length !== exam_paper_ids.length) {
    const foundIds = examPapers.map((ep) => ep._id.toString());
    const missingIds = exam_paper_ids.filter((id) => !foundIds.includes(id));
    throw new Error(`Exam papers not found: ${missingIds.join(", ")}`);
  }

  // Get all sessions for all exam papers
  const allSessions = await exam_sessions
    .find({ exam_paper_id: { $in: examPaperObjectIds } })
    .toArray();

  // Get all answers for all sessions
  const sessionIds = allSessions.map((s) => s._id.toString());
  const allAnswers = await answers
    .find({ exam_session_id: { $in: sessionIds } })
    .toArray();

  // Group sessions by exam paper
  const sessionsByExamPaper = new Map();
  exam_paper_ids.forEach((examPaperId) => {
    sessionsByExamPaper.set(
      examPaperId,
      allSessions.filter((s) => s.exam_paper_id.toString() === examPaperId)
    );
  });

  // Calculate statistics for each exam paper
  const comparisonResults = examPapers.map((examPaper) => {
    const examPaperId = examPaper._id.toString();
    const sessions = sessionsByExamPaper.get(examPaperId) || [];
    const completedSessions = sessions.filter((s) => s.status === "completed");
    const sessionIds = sessions.map((s) => s._id.toString());
    const examPaperAnswers = allAnswers.filter((a) =>
      sessionIds.includes(a.exam_session_id)
    );

    // Basic statistics
    const totalSessions = sessions.length;
    const completedSessionsCount = completedSessions.length;
    const completionRate =
      totalSessions > 0 ? (completedSessionsCount / totalSessions) * 100 : 0;

    // Score statistics
    let scoreStats = null;
    if (comparison_metrics.includes("scores")) {
      const scores = completedSessions
        .filter((s) => s.total_score !== undefined)
        .map((s) => s.total_score!);

      const percentages = completedSessions
        .filter((s) => s.total_score !== undefined)
        .map((s) => (s.total_score! / s.max_possible_score) * 100);

      scoreStats = {
        average_score:
          scores.length > 0
            ? scores.reduce((sum, score) => sum + score, 0) / scores.length
            : 0,
        average_percentage:
          percentages.length > 0
            ? percentages.reduce((sum, p) => sum + p, 0) / percentages.length
            : 0,
        highest_score: scores.length > 0 ? Math.max(...scores) : 0,
        lowest_score: scores.length > 0 ? Math.min(...scores) : 0,
        median_score:
          scores.length > 0
            ? scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)]
            : 0,
        total_attempts: scores.length,
      };
    }

    // Completion time statistics
    let timeStats = null;
    if (comparison_metrics.includes("completion_times")) {
      const completionTimes = completedSessions
        .filter((s) => s.completed_at)
        .map((session) => {
          const duration =
            session.completed_at!.getTime() - session.started_at.getTime();
          return Math.round(duration / 60000); // Convert to minutes
        });

      timeStats = {
        average_completion_time_minutes:
          completionTimes.length > 0
            ? completionTimes.reduce((sum, time) => sum + time, 0) /
              completionTimes.length
            : 0,
        fastest_completion_minutes:
          completionTimes.length > 0 ? Math.min(...completionTimes) : 0,
        slowest_completion_minutes:
          completionTimes.length > 0 ? Math.max(...completionTimes) : 0,
        median_completion_time_minutes:
          completionTimes.length > 0
            ? completionTimes.sort((a, b) => a - b)[
                Math.floor(completionTimes.length / 2)
              ]
            : 0,
      };
    }

    // Difficulty analysis
    let difficultyStats = null;
    if (comparison_metrics.includes("difficulty")) {
      const markedAnswers = examPaperAnswers.filter(
        (a) => a.marking_status === "completed"
      );
      const totalMarks = markedAnswers.reduce(
        (sum, a) => sum + (a.total_score || 0),
        0
      );
      const maxMarks = markedAnswers.reduce(
        (sum, a) => sum + a.max_possible_score,
        0
      );

      difficultyStats = {
        average_difficulty_score:
          maxMarks > 0 ? (totalMarks / maxMarks) * 100 : 0,
        total_answers: examPaperAnswers.length,
        marked_answers: markedAnswers.length,
        marking_completion_rate:
          examPaperAnswers.length > 0
            ? (markedAnswers.length / examPaperAnswers.length) * 100
            : 0,
      };
    }

    // Section performance
    let sectionStats = null;
    if (comparison_metrics.includes("section_performance")) {
      sectionStats = examPaper.sections.map((section) => {
        const sectionQuestionIds = new Set(section.questions);
        const sectionAnswers = examPaperAnswers.filter((answer) =>
          sectionQuestionIds.has(answer.question_id)
        );

        const markedSectionAnswers = sectionAnswers.filter(
          (a) => a.marking_status === "completed"
        );
        const totalSectionMarks = markedSectionAnswers.reduce(
          (sum, a) => sum + (a.total_score || 0),
          0
        );
        const maxSectionMarks = markedSectionAnswers.reduce(
          (sum, a) => sum + a.max_possible_score,
          0
        );

        return {
          section_id: section._id.toString(),
          title: section.title,
          total_questions: section.questions.length,
          total_answers: sectionAnswers.length,
          marked_answers: markedSectionAnswers.length,
          average_score:
            maxSectionMarks > 0
              ? (totalSectionMarks / maxSectionMarks) * 100
              : 0,
          total_marks: section.total_marks,
        };
      });
    }

    return {
      exam_paper_id: examPaperId,
      title: examPaper.title,
      subject: examPaper.subject,
      year: examPaper.year,
      total_marks: examPaper.total_marks,
      duration_minutes: examPaper.duration_minutes,
      basic_stats: {
        total_sessions: totalSessions,
        completed_sessions: completedSessionsCount,
        completion_rate: completionRate,
      },
      score_statistics: scoreStats,
      time_statistics: timeStats,
      difficulty_statistics: difficultyStats,
      section_statistics: sectionStats,
    };
  });

  // Calculate comparative metrics
  const comparativeAnalysis = {
    overall_rankings: {
      by_average_score: comparisonResults
        .filter((r) => r.score_statistics)
        .sort(
          (a, b) =>
            (b.score_statistics?.average_score || 0) -
            (a.score_statistics?.average_score || 0)
        )
        .map((r, index) => ({
          rank: index + 1,
          exam_paper_id: r.exam_paper_id,
          title: r.title,
          average_score: r.score_statistics?.average_score || 0,
        })),
      by_completion_rate: comparisonResults
        .sort(
          (a, b) =>
            (b.basic_stats.completion_rate || 0) -
            (a.basic_stats.completion_rate || 0)
        )
        .map((r, index) => ({
          rank: index + 1,
          exam_paper_id: r.exam_paper_id,
          title: r.title,
          completion_rate: r.basic_stats.completion_rate || 0,
        })),
      by_average_completion_time: comparisonResults
        .filter((r) => r.time_statistics)
        .sort(
          (a, b) =>
            (a.time_statistics?.average_completion_time_minutes || 0) -
            (b.time_statistics?.average_completion_time_minutes || 0)
        )
        .map((r, index) => ({
          rank: index + 1,
          exam_paper_id: r.exam_paper_id,
          title: r.title,
          average_completion_time_minutes:
            r.time_statistics?.average_completion_time_minutes || 0,
        })),
    },
    summary: {
      total_exam_papers: comparisonResults.length,
      total_sessions: comparisonResults.reduce(
        (sum, r) => sum + r.basic_stats.total_sessions,
        0
      ),
      total_completed_sessions: comparisonResults.reduce(
        (sum, r) => sum + r.basic_stats.completed_sessions,
        0
      ),
      overall_completion_rate:
        comparisonResults.reduce(
          (sum, r) => sum + r.basic_stats.total_sessions,
          0
        ) > 0
          ? (comparisonResults.reduce(
              (sum, r) => sum + r.basic_stats.completed_sessions,
              0
            ) /
              comparisonResults.reduce(
                (sum, r) => sum + r.basic_stats.total_sessions,
                0
              )) *
            100
          : 0,
    },
  };

  const result = {
    comparison_metrics,
    exam_papers: comparisonResults,
    comparative_analysis: comparativeAnalysis,
  };

  console.log("[compare-exam-papers] Comparison completed successfully", {
    examPaperCount: comparisonResults.length,
    totalSessions: comparativeAnalysis.summary.total_sessions,
  });

  return json(result);
});
