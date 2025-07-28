import { GetExamPaperByIdSchema } from "./schema";
import { exam_papers } from "../../db/collections/exam-papers";
import { questions } from "../../db/collections/questions";
import { ObjectId } from "mongodb";
import { tool, json } from "../tool-utils";

export const handler = tool(GetExamPaperByIdSchema, async (args) => {
  const { exam_paper_id } = args;

  console.log("[get-exam-paper-by-id] Handler invoked", { exam_paper_id });

  // Validate ObjectId format
  if (!ObjectId.isValid(exam_paper_id)) {
    throw new Error("Invalid exam paper ID format");
  }

  const objectId = new ObjectId(exam_paper_id);

  // Find the exam paper
  const examPaper = await exam_papers.findOne({ _id: objectId });

  if (!examPaper) {
    throw new Error(`Exam paper with ID ${exam_paper_id} not found`);
  }

  // Get question details for each section
  const allQuestionIds = examPaper.sections.flatMap(
    (section) => section.questions
  );
  const uniqueQuestionIds = [...new Set(allQuestionIds)];

  const questionDetails = await questions
    .find({ _id: { $in: uniqueQuestionIds.map((id) => new ObjectId(id)) } })
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

  // Enhance sections with question details
  const enhancedSections = examPaper.sections.map((section) => ({
    ...section,
    questions: section.questions.map((questionId) => ({
      question_id: questionId,
      details: questionMap.get(questionId) || null,
    })),
  }));

  const result = {
    ...examPaper,
    sections: enhancedSections,
  };

  console.log("[get-exam-paper-by-id] Exam paper retrieved successfully", {
    examPaperId: exam_paper_id,
    title: examPaper.title,
    sectionsCount: examPaper.sections.length,
  });

  return json(result);
});
