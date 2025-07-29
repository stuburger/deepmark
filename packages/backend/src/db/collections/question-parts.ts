import { ObjectId } from "mongodb";
import { db } from "../client";

export interface QuestionPart {
  _id: ObjectId;
  question_id: string; // Reference to the parent question
  part_label: string; // e.g., "a", "b", "c" or "1", "2", "3"
  text: string; // The actual question part text
  points?: number; // Points for this specific part
  difficulty_level?: "easy" | "medium" | "hard" | "expert";
  order: number; // Order within the parent question (1, 2, 3, etc.)
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export const question_parts = db.collection<QuestionPart>("question_parts");
