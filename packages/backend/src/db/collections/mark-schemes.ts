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
  question_id: string; // Reference to the parent question
  question_part_id?: string; // Reference to the specific question part (optional - can be null for whole question mark schemes)
  description: string;
  guidance?: string;
  created_by: string;
  created_at: Date;
  tags: string[];
  updated_at: Date;
  points_total: number;
  mark_points: MarkPoint[];
}

export const mark_schemes = db.collection<MarkScheme>("mark_schemes");
