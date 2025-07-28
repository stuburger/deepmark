import { ObjectId } from "mongodb";
import { db } from "../client";

export interface Answer {
  _id: ObjectId;
  question_id: string;
  student_id: string;
  student_answer: string;
  submitted_at: Date;
  marked_at?: Date;
  total_score?: number;
  max_possible_score: number;
  marking_status: "pending" | "completed" | "failed";

  // NEW: Exam paper context
  exam_paper_id: ObjectId; // Reference to exam_paper
  exam_session_id?: string; // For grouping answers from same exam session
}

export const answers = db.collection<Answer>("answers");
