import { ObjectId } from "mongodb";
import { db } from "../client";

export interface MarkPointResult {
  point_number: number;
  awarded: boolean;
  reasoning: string; // Why this mark was/wasn't awarded
  expected_criteria: string;
  student_covered: string; // What the student actually covered
}

export interface MarkingResult {
  _id: ObjectId;
  answer_id: string;
  mark_points_results: MarkPointResult[];
  total_score: number;
  max_possible_score: number;
  marked_at: Date;
  llm_reasoning: string; // Chain-of-thought reasoning
  feedback_summary: string;
}

export const marking_results = db.collection<MarkingResult>("marking_results");
