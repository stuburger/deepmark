import { ObjectId } from "mongodb";
import { db } from "../client";

export interface Question {
  _id: ObjectId;
  question_text: string;
  topic: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  subject: "biology" | "chemistry" | "physics" | "english";
  points?: number;
  difficulty_level?: "easy" | "medium" | "hard" | "expert";
  parent_question_ids: string[]; // Array of parent question IDs for hierarchical structure
  part_label: string | null; // e.g., "a", "b", "c" or "1", "2", "3"
}

export const questions = db.collection<Question>("questions");
