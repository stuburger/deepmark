import { ListAnswersByExamSessionSchema } from "./schema";
import { answers } from "../../db/collections/answers";
import { questions } from "../../db/collections/questions";
import {
  question_parts,
  QuestionPart,
} from "../../db/collections/question-parts";
import { exam_sessions } from "../../db/collections/exam-sessions";
import { ObjectId } from "mongodb";
import { tool, text } from "../tool-utils";

export const handler = tool(ListAnswersByExamSessionSchema, async (args) => {
  const { session_id } = args;

  console.log("[list-answers-by-exam-session] Handler invoked", {
    session_id,
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

  console.log("[list-answers-by-exam-session] Answers retrieved", {
    sessionId: session_id,
    answerCount: sessionAnswers.length,
  });

  return text(
    `Found ${sessionAnswers.length} answers for exam session ${session_id}
Session Status: ${examSession.status}

Answers:
${sessionAnswers
  .map(
    (answer, i) =>
      `${i + 1}. Question ID: ${answer.question_id}
     Question Part ID: ${answer.question_part_id || "N/A"}
     Student ID: ${answer.student_id}
     Answer ID: ${answer._id}
     Submitted: ${answer.submitted_at.toISOString()}
     Status: ${answer.marking_status}
     Answer: ${answer.student_answer}
  `
  )
  .join("\n")}`
  );
});
