import {
  questions,
  answers,
  marking_results,
  mark_schemes,
  exam_papers,
  exam_sessions,
} from "./collections";

export async function initializeIndexes() {
  console.log("Setting up database indexes...");

  try {
    // Exam papers indexes
    await exam_papers.createIndex({ subject: 1, year: 1 });
    await exam_papers.createIndex({ exam_board: 1, year: 1 });
    await exam_papers.createIndex({ is_active: 1 });

    // Questions indexes
    await questions.createIndex({ subject: 1, topic: 1 });
    await questions.createIndex({ created_by: 1 });
    await questions.createIndex({ difficulty_level: 1 });

    // Answers indexes
    await answers.createIndex({ question_id: 1 });
    await answers.createIndex({ student_id: 1 });
    await answers.createIndex({ exam_session_id: 1 });
    await answers.createIndex({ marking_status: 1 });

    // Marking results indexes
    await marking_results.createIndex({ answer_id: 1 });

    // Mark schemes indexes
    await mark_schemes.createIndex({ question_id: 1 });
    await mark_schemes.createIndex({ created_by: 1 });

    // Exam sessions indexes
    await exam_sessions.createIndex({ exam_paper_id: 1, student_id: 1 });
    await exam_sessions.createIndex({ student_id: 1, status: 1 });
    await exam_sessions.createIndex({ exam_paper_id: 1, status: 1 });

    console.log("✅ Database indexes initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize database indexes:", error);
    throw error;
  }
}
