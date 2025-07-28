import { ObjectId } from "mongodb";
import { db } from "../client";

export interface MarkPoint {
  point_number: number;
  description: string;
  points: 1; // can only be 1
  criteria: string;
}

export interface MarkScheme {
  _id: ObjectId;
  question_id: string;
  description: string;
  guidance?: string;
  created_by: string;
  created_at: Date;
  tags: string[];
  updated_at: Date;
  points_total: number;
  mark_points: MarkPoint[];

  // NEW: Exam paper association
  exam_paper_id: ObjectId; // Reference to exam_paper
  question_number: number; // Position within exam paper
}

export const mark_schemes = db.collection<MarkScheme>("mark_schemes");
