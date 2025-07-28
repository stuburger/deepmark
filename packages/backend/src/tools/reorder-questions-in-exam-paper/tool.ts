import { ReorderQuestionsInExamPaperSchema } from "./schema";
import { exam_papers, ExamSection } from "../../db/collections/exam-papers";
import { ObjectId } from "mongodb";
import { tool, text } from "../tool-utils";

export const handler = tool(ReorderQuestionsInExamPaperSchema, async (args) => {
  const { exam_paper_id, section_id, question_ids } = args;

  console.log("[reorder-questions-in-exam-paper] Handler invoked", {
    exam_paper_id,
    section_id,
    questionCount: question_ids.length,
  });

  // Validate ObjectId formats
  if (!ObjectId.isValid(exam_paper_id)) {
    throw new Error("Invalid exam paper ID format");
  }

  if (!ObjectId.isValid(section_id)) {
    throw new Error("Invalid section ID format");
  }

  const examPaperObjectId = new ObjectId(exam_paper_id);
  const sectionObjectId = new ObjectId(section_id);

  // Find the exam paper
  const examPaper = await exam_papers.findOne({ _id: examPaperObjectId });

  if (!examPaper) {
    throw new Error(`Exam paper with ID ${exam_paper_id} not found`);
  }

  // Find the section
  const sectionIndex = examPaper.sections.findIndex(
    (section) => section._id.toString() === section_id
  );

  if (sectionIndex === -1) {
    throw new Error(`Section with ID ${section_id} not found in exam paper`);
  }

  const section = examPaper.sections[sectionIndex];

  // Validate that all provided question IDs exist in the section
  const existingQuestionIds = new Set(section.questions);
  const providedQuestionIds = new Set(question_ids);

  // Check if all provided IDs exist in the section
  for (const questionId of question_ids) {
    if (!existingQuestionIds.has(questionId)) {
      throw new Error(
        `Question ID ${questionId} does not exist in section ${section_id}`
      );
    }
  }

  // Check if all section questions are included in the new order
  for (const questionId of section.questions) {
    if (!providedQuestionIds.has(questionId)) {
      throw new Error(
        `Question ID ${questionId} from section ${section_id} is missing from the new order`
      );
    }
  }

  // Create updated section with new question order
  const updatedSection: ExamSection = {
    ...section,
    questions: question_ids,
  };

  // Create updated sections array
  const updatedSections = [...examPaper.sections];
  updatedSections[sectionIndex] = updatedSection;

  // Update the exam paper
  const result = await exam_papers.updateOne(
    { _id: examPaperObjectId },
    {
      $set: {
        sections: updatedSections,
        updated_at: new Date(),
      },
    }
  );

  if (result.matchedCount === 0) {
    throw new Error(`Exam paper with ID ${exam_paper_id} not found`);
  }

  if (result.modifiedCount === 0) {
    console.log("[reorder-questions-in-exam-paper] No changes made");
    return text("Questions reordered successfully (no changes were necessary)");
  }

  console.log(
    "[reorder-questions-in-exam-paper] Questions reordered successfully",
    {
      examPaperId: exam_paper_id,
      sectionId: section_id,
      questionCount: question_ids.length,
    }
  );

  return text(
    `Questions reordered successfully!

Exam Paper ID: ${exam_paper_id}
Section: ${section.title}
Questions: ${question_ids.length} questions reordered

New order:
${question_ids.map((id, index) => `${index + 1}. ${id}`).join("\n")}`
  );
});
