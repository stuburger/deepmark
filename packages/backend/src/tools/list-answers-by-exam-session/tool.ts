import { ListAnswersByExamSessionSchema } from "./schema";
import { answers } from "../../db/collections/answers";
import { questions } from "../../db/collections/questions";
import { exam_sessions } from "../../db/collections/exam-sessions";
import { ObjectId } from "mongodb";
import { tool, text } from "../tool-utils";

export const handler = tool(ListAnswersByExamSessionSchema, async (args) => {
  const { session_id, include_question_details } = args;

  console.log("[list-answers-by-exam-session] Handler invoked", {
    session_id,
    include_question_details,
  });

  // Validate ObjectId format
  if (!ObjectId.isValid(session_id)) {
    throw new Error("Invalid session ID format");
  }

  const sessionObjectId = new ObjectId(session_id);

  // Check if exam session exists
  const examSession = await exam_sessions.findOne({ _id: sessionObjectId });

  if (!examSession) {
    throw new Error(`Exam session with ID ${session_id} not found`);
  }

  // Get all answers for this session
  const sessionAnswers = await answers
    .find({ exam_session_id: session_id })
    .sort({ submitted_at: 1 })
    .toArray();

  if (include_question_details) {
    // Get question details for all answers
    const questionIds = [...new Set(sessionAnswers.map((a) => a.question_id))];
    const questionDetails = await questions
      .find({ _id: { $in: questionIds.map((id) => new ObjectId(id)) } })
      .toArray();

    const questionMap = new Map(
      questionDetails.map((q) => [q._id.toString(), q])
    );

    // Enhance answers with question details
    const enhancedAnswers = sessionAnswers.map((answer) => ({
      ...answer,
      question_details: questionMap.get(answer.question_id) || null,
    }));

    const result = {
      session_id,
      session_status: examSession.status,
      total_answers: sessionAnswers.length,
      answers: enhancedAnswers,
    };

    console.log(
      "[list-answers-by-exam-session] Answers retrieved with question details",
      {
        sessionId: session_id,
        answerCount: sessionAnswers.length,
      }
    );

    return text(JSON.stringify(result, null, 2), result);
  } else {
    // Return just the answers without question details
    const result = {
      session_id,
      session_status: examSession.status,
      total_answers: sessionAnswers.length,
      answers: sessionAnswers,
    };

    console.log("[list-answers-by-exam-session] Answers retrieved", {
      sessionId: session_id,
      answerCount: sessionAnswers.length,
    });

    return text(JSON.stringify(result, null, 2), result);
  }
});
