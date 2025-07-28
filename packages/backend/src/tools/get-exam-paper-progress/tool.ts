import { GetExamPaperProgressSchema } from "./schema";
import { exam_papers } from "../../db/collections/exam-papers";
import { exam_sessions } from "../../db/collections/exam-sessions";
import { answers } from "../../db/collections/answers";
import { questions } from "../../db/collections/questions";
import { ObjectId } from "mongodb";
import { tool, json } from "../tool-utils";

export const handler = tool(GetExamPaperProgressSchema, async (args) => {
  const { exam_paper_id, student_id } = args;

  console.log("[get-exam-paper-progress] Handler invoked", {
    exam_paper_id,
    student_id,
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
      total_questions: examPaper.sections.reduce(
        (sum, section) => sum + section.questions.length,
        0
      ),
      total_marks: examPaper.total_marks,
      sessions: [],
      progress: {
        has_started: false,
        current_session: null,
        completed_sessions: 0,
        total_answers: 0,
        answered_questions: 0,
        progress_percentage: 0,
      },
    });
  }

  // Get the current (most recent) session
  const currentSession = sessions[0];

  // Get all answers for the current session
  const sessionAnswers = await answers
    .find({ exam_session_id: currentSession._id.toString() })
    .toArray();

  // Get question IDs for progress calculation
  const allQuestionIds = examPaper.sections.flatMap(
    (section) => section.questions
  );

  // Calculate progress metrics
  const totalQuestions = allQuestionIds.length;
  const answeredQuestions = sessionAnswers.length;
  const progressPercentage =
    totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;

  // Calculate section-wise progress
  const sectionProgress = examPaper.sections.map((section) => {
    const sectionQuestionIds = new Set(section.questions);
    const sectionAnswers = sessionAnswers.filter((answer) =>
      sectionQuestionIds.has(answer.question_id)
    );

    return {
      section_id: section._id.toString(),
      title: section.title,
      total_questions: section.questions.length,
      answered_questions: sectionAnswers.length,
      progress_percentage:
        section.questions.length > 0
          ? (sectionAnswers.length / section.questions.length) * 100
          : 0,
      total_marks: section.total_marks,
      earned_marks: sectionAnswers.reduce(
        (sum, answer) => sum + (answer.total_score || 0),
        0
      ),
    };
  });

  const result = {
    exam_paper_id,
    student_id,
    exam_paper_title: examPaper.title,
    totalQuestions,
    total_marks: examPaper.total_marks,
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
    })),
    progress: {
      has_started: true,
      current_session: currentSession._id.toString(),
      current_session_status: currentSession.status,
      completed_sessions: sessions.filter((s) => s.status === "completed")
        .length,
      total_answers: sessionAnswers.length,
      answered_questions: answeredQuestions,
      progress_percentage: progressPercentage,
      section_progress: sectionProgress,
    },
  };

  console.log("[get-exam-paper-progress] Progress retrieved successfully", {
    examPaperId: exam_paper_id,
    studentId: student_id,
    sessionCount: sessions.length,
    progressPercentage,
  });

  return json(result);
});
