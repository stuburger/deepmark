import { UpdateExamPaperSchema } from "./schema";
import {
  ExamPaper,
  exam_papers,
  ExamSection,
} from "../../db/collections/exam-papers";
import { questions } from "../../db/collections/questions";
import { ObjectId } from "mongodb";
import { tool, text } from "../tool-utils";

export const handler = tool(UpdateExamPaperSchema, async (args) => {
  const {
    exam_paper_id,
    title,
    subject,
    year,
    paper_number,
    duration_minutes,
    sections,
    metadata,
    is_active,
  } = args;

  console.log("[update-exam-paper] Handler invoked", {
    exam_paper_id,
    hasTitle: !!title,
    hasSubject: !!subject,
    hasSections: !!sections,
    hasMetadata: !!metadata,
  });

  // Validate ObjectId format
  if (!ObjectId.isValid(exam_paper_id)) {
    throw new Error("Invalid exam paper ID format");
  }

  const objectId = new ObjectId(exam_paper_id);

  // Check if exam paper exists
  const existingExamPaper = await exam_papers.findOne({ _id: objectId });

  if (!existingExamPaper) {
    throw new Error(`Exam paper with ID ${exam_paper_id} not found`);
  }

  // Prepare update object
  const updateData: Partial<ExamPaper> = {
    updated_at: new Date(),
  };

  if (title !== undefined) updateData.title = title;
  if (subject !== undefined) updateData.subject = subject;
  if (year !== undefined) updateData.year = year;
  if (paper_number !== undefined) updateData.paper_number = paper_number;
  if (duration_minutes !== undefined)
    updateData.duration_minutes = duration_minutes;
  if (metadata !== undefined) updateData.metadata = metadata;
  if (is_active !== undefined) updateData.is_active = is_active;

  // Handle sections update if provided
  if (sections !== undefined) {
    // Validate that all question IDs exist
    const allQuestionIds = sections.flatMap((section) => section.questions);
    const uniqueQuestionIds = [...new Set(allQuestionIds)];

    const existingQuestions = await questions
      .find({ _id: { $in: uniqueQuestionIds.map((id) => new ObjectId(id)) } })
      .toArray();

    if (existingQuestions.length !== uniqueQuestionIds.length) {
      const existingIds = existingQuestions.map((q) => q._id.toString());
      const missingIds = uniqueQuestionIds.filter(
        (id) => !existingIds.includes(id)
      );
      throw new Error(
        `The following question IDs do not exist: ${missingIds.join(", ")}`
      );
    }

    // Calculate total marks from sections
    const totalMarks = sections.reduce(
      (sum, section) => sum + section.total_marks,
      0
    );

    // Create exam sections with ObjectIds
    const examSections: ExamSection[] = sections.map((section) => ({
      _id: new ObjectId(),
      title: section.title,
      description: section.description,
      questions: section.questions,
      total_marks: section.total_marks,
      instructions: section.instructions,
    }));

    updateData.sections = examSections;
    updateData.total_marks = totalMarks;
  }

  console.log("[update-exam-paper] Updating exam paper", { updateData });

  // Update the exam paper
  const result = await exam_papers.updateOne(
    { _id: objectId },
    { $set: updateData }
  );

  if (result.matchedCount === 0) {
    throw new Error(`Exam paper with ID ${exam_paper_id} not found`);
  }

  if (result.modifiedCount === 0) {
    console.log("[update-exam-paper] No changes made to exam paper");
    return text("Exam paper updated successfully (no changes were necessary)");
  }

  console.log("[update-exam-paper] Exam paper updated successfully", {
    examPaperId: exam_paper_id,
    modifiedCount: result.modifiedCount,
  });

  const updateSummary = [
    title && `Title: ${title}`,
    subject && `Subject: ${subject}`,
    year && `Year: ${year}`,
    paper_number && `Paper Number: ${paper_number}`,
    duration_minutes && `Duration: ${duration_minutes} minutes`,
    sections && `Sections: ${sections.length} sections updated`,
    metadata && "Metadata updated",
    is_active !== undefined && `Active status: ${is_active}`,
  ]
    .filter(Boolean)
    .join("\n");

  return text(
    `Exam paper updated successfully!

Exam Paper ID: ${exam_paper_id}

Updated fields:
${updateSummary}`
  );
});
