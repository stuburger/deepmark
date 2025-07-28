import { CreateExamPaperSchema } from "./schema";
import {
  ExamPaper,
  exam_papers,
  ExamSection,
} from "../../db/collections/exam-papers";
import { questions } from "../../db/collections/questions";
import { ObjectId } from "mongodb";
import { tool, text } from "../tool-utils";

export const handler = tool(CreateExamPaperSchema, async (args) => {
  const {
    title,
    subject,
    year,
    paper_number,
    duration_minutes,
    sections,
    metadata,
  } = args;

  console.log("[create-exam-paper] Handler invoked", {
    title,
    subject,
    year,
    paper_number,
    duration_minutes,
    sectionsCount: sections.length,
  });

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

  // Create the exam paper document
  const examPaperData: ExamPaper = {
    _id: new ObjectId(),
    title,
    subject,
    year,
    paper_number,
    total_marks: totalMarks,
    duration_minutes,
    created_by: "system", // TODO: Get from auth context when available
    created_at: new Date(),
    updated_at: new Date(),
    is_active: true,
    sections: examSections,
    metadata: metadata || {
      difficulty_level: "higher",
      tier: "higher",
      season: "summer",
    },
  };

  console.log("[create-exam-paper] Creating exam paper", { examPaperData });

  // Insert the exam paper into the database
  const result = await exam_papers.insertOne(examPaperData);

  if (!result.insertedId) {
    console.log(
      "[create-exam-paper] Failed to insert exam paper - no insertedId returned"
    );
    throw new Error("Failed to insert exam paper into database");
  }

  console.log("[create-exam-paper] Exam paper created successfully", {
    examPaperId: result.insertedId,
  });

  const sectionsInfo = sections
    .map(
      (section) =>
        `${section.title}: ${section.questions.length} questions, ${section.total_marks} marks`
    )
    .join("\n  ");

  return text(
    `Exam paper created successfully! Exam Paper ID: ${result.insertedId}

Title: ${title}
Subject: ${subject}
Year: ${year}
Duration: ${duration_minutes} minutes
Total Marks: ${totalMarks}
Sections: ${sections.length}
  ${sectionsInfo}`
  );
});
