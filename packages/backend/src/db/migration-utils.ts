import { ObjectId } from "mongodb";
import {
  questions,
  answers,
  marking_results,
  mark_schemes,
  exam_papers,
} from "./collections";

/**
 * Creates a default exam paper for existing data migration
 */
export async function createDefaultExamPaper(subject: string) {
  const defaultPaper = {
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
 * Migrates existing questions to include exam paper association
 */
export async function migrateQuestionsToExamPapers() {
  console.log("Starting questions migration...");

  // Get all subjects from existing questions
  const subjects = await questions.distinct("subject");

  for (const subject of subjects) {
    console.log(`Migrating ${subject} questions...`);

    // Create default exam paper for this subject
    const examPaperId = await createDefaultExamPaper(subject);

    // Update all questions for this subject
    const result = await questions.updateMany(
      { subject, exam_paper_id: { $exists: false } },
      {
        $set: {
          exam_paper_id: examPaperId,
          question_number: 1, // Default to 1, can be updated later
        },
      }
    );

    console.log(`Updated ${result.modifiedCount} ${subject} questions`);
  }
}

/**
 * Migrates existing answers to include exam paper context
 */
export async function migrateAnswersToExamPapers() {
  console.log("Starting answers migration...");

  // Get all answers that don't have exam_paper_id
  const answersToMigrate = await answers
    .find({
      exam_paper_id: { $exists: false },
    })
    .toArray();

  for (const answer of answersToMigrate) {
    // Find the question to get its exam paper
    const question = await questions.findOne({
      _id: new ObjectId(answer.question_id),
    });

    if (question && question.exam_paper_id) {
      await answers.updateOne(
        { _id: answer._id },
        { $set: { exam_paper_id: question.exam_paper_id } }
      );
    }
  }

  console.log(`Migrated ${answersToMigrate.length} answers`);
}

/**
 * Migrates existing marking results to include exam paper context
 */
export async function migrateMarkingResultsToExamPapers() {
  console.log("Starting marking results migration...");

  const resultsToMigrate = await marking_results
    .find({
      exam_paper_id: { $exists: false },
    })
    .toArray();

  for (const result of resultsToMigrate) {
    // Find the answer to get its exam paper
    const answer = await answers.findOne({
      _id: new ObjectId(result.answer_id),
    });

    if (answer && answer.exam_paper_id) {
      // Find the question to get the question number
      const question = await questions.findOne({
        _id: new ObjectId(answer.question_id),
      });

      await marking_results.updateOne(
        { _id: result._id },
        {
          $set: {
            exam_paper_id: answer.exam_paper_id,
            question_number: question?.question_number || 1,
          },
        }
      );
    }
  }

  console.log(`Migrated ${resultsToMigrate.length} marking results`);
}

/**
 * Migrates existing mark schemes to include exam paper association
 */
export async function migrateMarkSchemesToExamPapers() {
  console.log("Starting mark schemes migration...");

  const schemesToMigrate = await mark_schemes
    .find({
      exam_paper_id: { $exists: false },
    })
    .toArray();

  for (const scheme of schemesToMigrate) {
    // Find the question to get its exam paper
    const question = await questions.findOne({
      _id: new ObjectId(scheme.question_id),
    });

    if (question && question.exam_paper_id) {
      await mark_schemes.updateOne(
        { _id: scheme._id },
        {
          $set: {
            exam_paper_id: question.exam_paper_id,
            question_number: question.question_number || 1,
          },
        }
      );
    }
  }

  console.log(`Migrated ${schemesToMigrate.length} mark schemes`);
}

/**
 * Runs the complete migration process
 */
export async function runMigration() {
  console.log("🚀 Starting database migration to exam paper schema...");

  try {
    await migrateQuestionsToExamPapers();
    await migrateAnswersToExamPapers();
    await migrateMarkingResultsToExamPapers();
    await migrateMarkSchemesToExamPapers();

    console.log("✅ Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}
