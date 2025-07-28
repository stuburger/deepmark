import { MigrateExistingDataSchema } from "./schema";
import { questions } from "../../db/collections/questions";
import { exam_papers } from "../../db/collections/exam-papers";
import { mark_schemes } from "../../db/collections/mark-schemes";
import { exam_sessions } from "../../db/collections/exam-sessions";
import { answers } from "../../db/collections/answers";
import { ObjectId } from "mongodb";
import { tool, text } from "../tool-utils";

export const handler = tool(MigrateExistingDataSchema, async (args) => {
  const { source_format, source_data, target_collection, validation_mode } =
    args;

  console.log("[migrate-existing-data] Handler invoked", {
    source_format,
    target_collection,
    validation_mode,
    dataLength: source_data.length,
  });

  let parsedData: any[] = [];

  try {
    // Parse source data based on format
    switch (source_format) {
      case "json":
        parsedData = JSON.parse(source_data);
        if (!Array.isArray(parsedData)) {
          throw new Error("JSON data must be an array of objects");
        }
        break;

      case "csv":
        // Simple CSV parsing (assumes first row is headers)
        const lines = source_data.trim().split("\n");
        if (lines.length < 2) {
          throw new Error(
            "CSV data must have at least a header row and one data row"
          );
        }

        const headers = lines[0].split(",").map((h) => h.trim());
        parsedData = lines.slice(1).map((line) => {
          const values = line.split(",").map((v) => v.trim());
          const obj: any = {};
          headers.forEach((header, index) => {
            obj[header] = values[index] || "";
          });
          return obj;
        });
        break;

      case "excel":
        // For Excel, we'd need a library like xlsx
        // For now, we'll assume it's base64 encoded and provide guidance
        throw new Error(
          "Excel format not yet implemented. Please convert to JSON or CSV first."
        );
        break;

      default:
        throw new Error(`Unsupported source format: ${source_format}`);
    }

    console.log("[migrate-existing-data] Parsed data successfully", {
      recordCount: parsedData.length,
    });
  } catch (error) {
    throw new Error(
      `Failed to parse source data: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }

  // Validate and transform data based on target collection
  let validationResults: any = {
    total_records: parsedData.length,
    valid_records: 0,
    invalid_records: 0,
    errors: [] as string[],
    transformed_data: [] as any[],
  };

  switch (target_collection) {
    case "questions":
      validationResults = validateAndTransformQuestions(parsedData);
      break;
    case "exam_papers":
      validationResults = validateAndTransformExamPapers(parsedData);
      break;
    case "mark_schemes":
      validationResults = validateAndTransformMarkSchemes(parsedData);
      break;
    case "exam_sessions":
      validationResults = validateAndTransformExamSessions(parsedData);
      break;
    case "answers":
      validationResults = validateAndTransformAnswers(parsedData);
      break;
    default:
      throw new Error(`Unsupported target collection: ${target_collection}`);
  }

  // Insert data if not in validation mode
  let insertResults = null;
  if (!validation_mode && validationResults.valid_records > 0) {
    try {
      const collection = getCollection(target_collection);
      const result = await collection.insertMany(
        validationResults.transformed_data
      );
      insertResults = {
        inserted_count: result.insertedCount,
        inserted_ids: Object.values(result.insertedIds),
      };
    } catch (error) {
      throw new Error(
        `Failed to insert data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  const result = {
    validation_mode,
    target_collection,
    validation_results: validationResults,
    insert_results: insertResults,
  };

  console.log("[migrate-existing-data] Migration completed", {
    validationMode: validation_mode,
    targetCollection: target_collection,
    validRecords: validationResults.valid_records,
    invalidRecords: validationResults.invalid_records,
    insertedCount: insertResults?.inserted_count || 0,
  });

  const summary = `Migration ${
    validation_mode ? "validation" : "completed"
  } successfully!

Target Collection: ${target_collection}
Total Records: ${validationResults.total_records}
Valid Records: ${validationResults.valid_records}
Invalid Records: ${validationResults.invalid_records}
${
  !validation_mode && insertResults
    ? `Inserted Records: ${insertResults.inserted_count}`
    : ""
}

${
  validationResults.errors.length > 0
    ? `Errors:\n${validationResults.errors.join("\n")}`
    : ""
}`;

  return text(summary);
});

function getCollection(collectionName: string) {
  switch (collectionName) {
    case "questions":
      return questions;
    case "exam_papers":
      return exam_papers;
    case "mark_schemes":
      return mark_schemes;
    case "exam_sessions":
      return exam_sessions;
    case "answers":
      return answers;
    default:
      throw new Error(`Unknown collection: ${collectionName}`);
  }
}

function validateAndTransformQuestions(data: any[]) {
  const results = {
    total_records: data.length,
    valid_records: 0,
    invalid_records: 0,
    errors: [] as string[],
    transformed_data: [] as any[],
  };

  data.forEach((record, index) => {
    try {
      // Basic validation
      if (!record.question_text) {
        results.errors.push(`Record ${index + 1}: Missing question_text`);
        results.invalid_records++;
        return;
      }

      // Transform and validate
      const transformed = {
        _id: new ObjectId(),
        question_text: record.question_text,
        question_type: record.question_type || "multiple_choice",
        subject: record.subject || "biology",
        marks: parseInt(record.marks) || 1,
        difficulty: record.difficulty || "medium",
        created_at: new Date(),
        updated_at: new Date(),
      };

      results.transformed_data.push(transformed);
      results.valid_records++;
    } catch (error) {
      results.errors.push(
        `Record ${index + 1}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      results.invalid_records++;
    }
  });

  return results;
}

function validateAndTransformExamPapers(data: any[]) {
  const results = {
    total_records: data.length,
    valid_records: 0,
    invalid_records: 0,
    errors: [] as string[],
    transformed_data: [] as any[],
  };

  data.forEach((record, index) => {
    try {
      // Basic validation
      if (!record.title || !record.subject) {
        results.errors.push(`Record ${index + 1}: Missing title or subject`);
        results.invalid_records++;
        return;
      }

      // Transform and validate
      const transformed = {
        _id: new ObjectId(),
        title: record.title,
        subject: record.subject,
        year: parseInt(record.year) || new Date().getFullYear(),
        total_marks: parseInt(record.total_marks) || 0,
        duration_minutes: parseInt(record.duration_minutes) || 60,
        created_by: record.created_by || "system",
        created_at: new Date(),
        updated_at: new Date(),
        is_active: record.is_active !== false,
        sections: record.sections || [],
        metadata: record.metadata || {},
      };

      results.transformed_data.push(transformed);
      results.valid_records++;
    } catch (error) {
      results.errors.push(
        `Record ${index + 1}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      results.invalid_records++;
    }
  });

  return results;
}

function validateAndTransformMarkSchemes(data: any[]) {
  const results = {
    total_records: data.length,
    valid_records: 0,
    invalid_records: 0,
    errors: [] as string[],
    transformed_data: [] as any[],
  };

  data.forEach((record, index) => {
    try {
      // Basic validation
      if (!record.question_id || !record.mark_points) {
        results.errors.push(
          `Record ${index + 1}: Missing question_id or mark_points`
        );
        results.invalid_records++;
        return;
      }

      // Transform and validate
      const transformed = {
        _id: new ObjectId(),
        question_id: record.question_id,
        mark_points: record.mark_points,
        total_marks: parseInt(record.total_marks) || 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      results.transformed_data.push(transformed);
      results.valid_records++;
    } catch (error) {
      results.errors.push(
        `Record ${index + 1}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      results.invalid_records++;
    }
  });

  return results;
}

function validateAndTransformExamSessions(data: any[]) {
  const results = {
    total_records: data.length,
    valid_records: 0,
    invalid_records: 0,
    errors: [] as string[],
    transformed_data: [] as any[],
  };

  data.forEach((record, index) => {
    try {
      // Basic validation
      if (!record.exam_paper_id || !record.student_id) {
        results.errors.push(
          `Record ${index + 1}: Missing exam_paper_id or student_id`
        );
        results.invalid_records++;
        return;
      }

      // Transform and validate
      const transformed = {
        _id: new ObjectId(),
        exam_paper_id: new ObjectId(record.exam_paper_id),
        student_id: record.student_id,
        started_at: new Date(record.started_at || Date.now()),
        completed_at: record.completed_at
          ? new Date(record.completed_at)
          : undefined,
        status: record.status || "in_progress",
        total_score: record.total_score
          ? parseInt(record.total_score)
          : undefined,
        max_possible_score: parseInt(record.max_possible_score) || 0,
        metadata: record.metadata || {},
      };

      results.transformed_data.push(transformed);
      results.valid_records++;
    } catch (error) {
      results.errors.push(
        `Record ${index + 1}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      results.invalid_records++;
    }
  });

  return results;
}

function validateAndTransformAnswers(data: any[]) {
  const results = {
    total_records: data.length,
    valid_records: 0,
    invalid_records: 0,
    errors: [] as string[],
    transformed_data: [] as any[],
  };

  data.forEach((record, index) => {
    try {
      // Basic validation
      if (!record.question_id || !record.student_id || !record.student_answer) {
        results.errors.push(
          `Record ${
            index + 1
          }: Missing question_id, student_id, or student_answer`
        );
        results.invalid_records++;
        return;
      }

      // Transform and validate
      const transformed = {
        _id: new ObjectId(),
        question_id: record.question_id,
        student_id: record.student_id,
        student_answer: record.student_answer,
        submitted_at: new Date(record.submitted_at || Date.now()),
        marked_at: record.marked_at ? new Date(record.marked_at) : undefined,
        total_score: record.total_score
          ? parseInt(record.total_score)
          : undefined,
        max_possible_score: parseInt(record.max_possible_score) || 0,
        marking_status: record.marking_status || "pending",
        exam_session_id: record.exam_session_id,
      };

      results.transformed_data.push(transformed);
      results.valid_records++;
    } catch (error) {
      results.errors.push(
        `Record ${index + 1}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      results.invalid_records++;
    }
  });

  return results;
}
