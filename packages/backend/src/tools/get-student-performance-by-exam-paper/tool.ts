import { GetStudentPerformanceByExamPaperSchema } from "./schema";
import { exam_papers } from "../../db/collections/exam-papers";
import { exam_sessions } from "../../db/collections/exam-sessions";
import { answers } from "../../db/collections/answers";
import { questions } from "../../db/collections/questions";
import { ObjectId } from "mongodb";
import { tool, json } from "../tool-utils";

export const handler = tool(
  GetStudentPerformanceByExamPaperSchema,
  async (args) => {
    const { exam_paper_id, student_id, include_answer_details } = args;

    console.log("[get-student-performance-by-exam-paper] Handler invoked", {
      exam_paper_id,
      student_id,
      include_answer_details,
    });

    // Validate ObjectId format
    if (!ObjectId.isValid(exam_paper_id)) {
      throw new Error("Invalid exam paper ID format");
    }

    const examPaperObjectId = new ObjectId(exam_paper_id);

    // Get exam paper details
    const examPaper = await exam_papers.findOne({ _id: examPaperObjectId });

    if (!examPaper) {
      throw new Error(`Exam paper with ID ${exam_paper_id} not found`);
    }

    // Get all sessions for this student and exam paper
    const sessions = await exam_sessions
      .find({
        exam_paper_id: examPaperObjectId,
        student_id,
      })
      .sort({ started_at: -1 })
      .toArray();

    if (sessions.length === 0) {
      return json({
        exam_paper_id,
        student_id,
        exam_paper_title: examPaper.title,
        sessions: [],
        performance: {
          has_attempted: false,
          total_sessions: 0,
          completed_sessions: 0,
          best_score: null,
          average_score: null,
          total_time_spent: 0,
        },
      });
    }

    // Get all answers for all sessions
    const sessionIds = sessions.map((s) => s._id.toString());
    const allAnswers = await answers
      .find({ exam_session_id: { $in: sessionIds } })
      .toArray();

    // Get question details for analysis
    const allQuestionIds = examPaper.sections.flatMap(
      (section) => section.questions
    );
    const questionDetails = await questions
      .find({ _id: { $in: allQuestionIds.map((id) => new ObjectId(id)) } })
      .project({
        _id: 1,
        question_text: 1,
        question_type: 1,
        marks: 1,
        difficulty: 1,
      })
      .toArray();

    const questionMap = new Map(
      questionDetails.map((q) => [q._id.toString(), q])
    );

    // Calculate performance metrics
    const completedSessions = sessions.filter((s) => s.status === "completed");
    const bestSession = completedSessions.reduce((best, current) => {
      if (!best || (current.total_score || 0) > (best.total_score || 0)) {
        return current;
      }
      return best;
    }, null as any);

    const averageScore =
      completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => sum + (s.total_score || 0), 0) /
          completedSessions.length
        : 0;

    const totalTimeSpent = sessions.reduce((total, session) => {
      if (session.completed_at) {
        const duration =
          session.completed_at.getTime() - session.started_at.getTime();
        return total + duration;
      }
      return total;
    }, 0);

    // Calculate section-wise performance
    const sectionPerformance = examPaper.sections.map((section) => {
      const sectionQuestionIds = new Set(section.questions);
      const sectionAnswers = allAnswers.filter((answer) =>
        sectionQuestionIds.has(answer.question_id)
      );

      const markedAnswers = sectionAnswers.filter(
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

      return {
        section_id: section._id.toString(),
        title: section.title,
        total_questions: section.questions.length,
        answered_questions: sectionAnswers.length,
        marked_questions: markedAnswers.length,
        total_marks_earned: totalMarks,
        total_marks_possible: maxMarks,
        percentage_score: maxMarks > 0 ? (totalMarks / maxMarks) * 100 : 0,
        average_per_question:
          markedAnswers.length > 0 ? totalMarks / markedAnswers.length : 0,
      };
    });

    // Calculate question-wise performance if detailed analysis is requested
    let questionAnalysis = null;
    if (include_answer_details) {
      questionAnalysis = allQuestionIds.map((questionId) => {
        const question = questionMap.get(questionId);
        const questionAnswers = allAnswers.filter(
          (a) => a.question_id === questionId
        );
        const markedAnswers = questionAnswers.filter(
          (a) => a.marking_status === "completed"
        );

        return {
          question_id: questionId,
          question_text: question?.question_text || "Unknown",
          question_type: question?.question_type || "Unknown",
          marks: question?.marks || 0,
          difficulty: question?.difficulty || "Unknown",
          total_attempts: questionAnswers.length,
          marked_attempts: markedAnswers.length,
          average_score:
            markedAnswers.length > 0
              ? markedAnswers.reduce(
                  (sum, a) => sum + (a.total_score || 0),
                  0
                ) / markedAnswers.length
              : 0,
          best_score:
            markedAnswers.length > 0
              ? Math.max(...markedAnswers.map((a) => a.total_score || 0))
              : 0,
          answers: include_answer_details
            ? questionAnswers.map((answer) => ({
                answer_id: answer._id.toString(),
                session_id: answer.exam_session_id,
                student_answer: answer.student_answer,
                score: answer.total_score,
                max_score: answer.max_possible_score,
                marking_status: answer.marking_status,
                submitted_at: answer.submitted_at,
              }))
            : [],
        };
      });
    }

    const result = {
      exam_paper_id,
      student_id,
      exam_paper_title: examPaper.title,
      subject: examPaper.subject,
      year: examPaper.year,
      sessions: sessions.map((session) => ({
        session_id: session._id.toString(),
        status: session.status,
        started_at: session.started_at,
        completed_at: session.completed_at,
        total_score: session.total_score,
        max_possible_score: session.max_possible_score,
        percentage_score: session.total_score
          ? (session.total_score / session.max_possible_score) * 100
          : null,
        duration_minutes: session.completed_at
          ? Math.round(
              (session.completed_at.getTime() - session.started_at.getTime()) /
                60000
            )
          : null,
      })),
      performance: {
        has_attempted: true,
        total_sessions: sessions.length,
        completed_sessions: completedSessions.length,
        best_score: bestSession?.total_score || null,
        best_percentage: bestSession?.total_score
          ? (bestSession.total_score / bestSession.max_possible_score) * 100
          : null,
        average_score: Math.round(averageScore * 100) / 100,
        average_percentage:
          completedSessions.length > 0
            ? Math.round((averageScore / examPaper.total_marks) * 100 * 100) /
              100
            : null,
        total_time_spent_minutes: Math.round(totalTimeSpent / 60000),
        average_time_per_session_minutes:
          sessions.length > 0
            ? Math.round(totalTimeSpent / 60000 / sessions.length)
            : 0,
        section_performance: sectionPerformance,
        question_analysis: questionAnalysis,
      },
    };

    console.log(
      "[get-student-performance-by-exam-paper] Performance analyzed successfully",
      {
        examPaperId: exam_paper_id,
        studentId: student_id,
        sessionCount: sessions.length,
        bestScore: bestSession?.total_score,
      }
    );

    return json(result);
  }
);
