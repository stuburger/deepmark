import { ObjectId } from "mongodb";
import {
  questions,
  answers,
  marking_results,
  mark_schemes,
  exam_papers,
  ExamPaper,
  ExamSection,
} from "./collections";

/**
 * Creates a default exam paper with sections for existing data migration
 */
export async function createDefaultExamPaper(subject: string) {
  const defaultPaper: ExamPaper = {
    _id: new ObjectId(),
    title: `Default ${
      subject.charAt(0).toUpperCase() + subject.slice(1)
    } Paper`,
    subject: subject as "biology" | "chemistry" | "physics" | "english",
    exam_board: "Default",
    year: new Date().getFullYear(),
    paper_number: 1,
    total_marks: 0, // Will be calculated
    duration_minutes: 120,
    created_by: "system",
    created_at: new Date(),
    updated_at: new Date(),
    is_active: true,
    sections: [], // Will be populated with sections
    metadata: {
      difficulty_level: "higher",
      tier: "higher",
      season: "summer",
    },
  };

  await exam_papers.insertOne(defaultPaper);
  return defaultPaper._id;
}

/**
 * Migrates existing questions to remove exam paper associations
 */
export async function migrateQuestionsToRemoveExamPaperAssociations() {
  console.log(
    "Starting questions migration to remove exam paper associations..."
  );

  // Remove exam_paper_id, question_number, and section fields from questions
  const result = await questions.updateMany(
    {},
    {
      $unset: {
        exam_paper_id: "",
        question_number: "",
        section: "",
      },
    }
  );

  console.log(`Updated ${result.modifiedCount} questions`);
}

/**
 * Migrates existing answers to remove exam paper associations
 */
export async function migrateAnswersToRemoveExamPaperAssociations() {
  console.log(
    "Starting answers migration to remove exam paper associations..."
  );

  // Remove exam_paper_id field from answers
  const result = await answers.updateMany(
    {},
    {
      $unset: {
        exam_paper_id: "",
      },
    }
  );

  console.log(`Updated ${result.modifiedCount} answers`);
}

/**
 * Migrates existing marking results to remove exam paper associations
 */
export async function migrateMarkingResultsToRemoveExamPaperAssociations() {
  console.log(
    "Starting marking results migration to remove exam paper associations..."
  );

  // Remove exam_paper_id and question_number fields from marking results
  const result = await marking_results.updateMany(
    {},
    {
      $unset: {
        exam_paper_id: "",
        question_number: "",
      },
    }
  );

  console.log(`Updated ${result.modifiedCount} marking results`);
}

/**
 * Migrates existing mark schemes to remove exam paper associations
 */
export async function migrateMarkSchemesToRemoveExamPaperAssociations() {
  console.log(
    "Starting mark schemes migration to remove exam paper associations..."
  );

  // Remove exam_paper_id field from mark schemes
  const result = await mark_schemes.updateMany(
    {},
    {
      $unset: {
        exam_paper_id: "",
      },
    }
  );

  console.log(`Updated ${result.modifiedCount} mark schemes`);
}

/**
 * Runs the complete migration process to remove exam paper associations
 */
export async function runMigrationToRemoveExamPaperAssociations() {
  console.log(
    "🚀 Starting database migration to remove exam paper associations..."
  );

  try {
    await migrateQuestionsToRemoveExamPaperAssociations();
    await migrateAnswersToRemoveExamPaperAssociations();
    await migrateMarkingResultsToRemoveExamPaperAssociations();
    await migrateMarkSchemesToRemoveExamPaperAssociations();

    console.log("✅ Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}
