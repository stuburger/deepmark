import { ObjectId } from "mongodb";
import { db } from "../client";

export interface ExamSection {
  _id: ObjectId;
  title: string; // e.g., "Section A", "Section B"
  description?: string;
  questions: string[]; // Array of question IDs in order
  total_marks: number;
  instructions?: string; // e.g., "Answer all questions in this section"
}

export interface ExamPaper {
  _id: ObjectId;
  title: string; // e.g., "GCSE Biology Paper 1 - 2024"
  subject: "biology" | "chemistry" | "physics" | "english";
  exam_board?: string; // e.g., "AQA", "Edexcel", "OCR"
  year: number; // e.g., 2024
  paper_number?: number; // e.g., 1, 2 for multiple papers
  total_marks: number;
  duration_minutes: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  is_active: boolean; // for soft deletion
  sections: ExamSection[]; // Array of sections with ordered questions
  metadata?: {
    difficulty_level?: "foundation" | "higher";
    tier?: "foundation" | "higher";
    season?: "summer" | "autumn" | "winter";
  };
}

export const exam_papers = db.collection<ExamPaper>("exam_papers");
