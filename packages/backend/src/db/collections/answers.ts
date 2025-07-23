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
}

export const answers = db.collection<Answer>("answers");
