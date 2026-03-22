"use client";

import { ExamPaperPanel } from "@/components/ExamPaperPanel";
import type { ExtractedAnswer } from "@/lib/mark-actions";
import { useState } from "react";
import { ExamPaperSelector } from "./exam-paper-selector";
import { StudentLinker } from "./student-linker";

/**
 * Wizard that runs after OCR completes (text_extracted phase).
 *
 * Step 1 — Student linker (skippable)
 * Step 2 — Exam paper selector + live marking progress
 *
 * Extracted answers are shown throughout so the teacher can verify
 * what was read from the scan before committing to marking.
 */
export function PaperSetupWizard({
  jobId,
  studentLinked,
  detectedStudentName,
  examPaperPreselected,
  extractedAnswers,
  detectedSubject,
}: {
  jobId: string;
  studentLinked: boolean;
  detectedStudentName: string | null;
  examPaperPreselected: boolean;
  extractedAnswers: ExtractedAnswer[];
  detectedSubject: string | null;
}) {
  const [skippedStudent, setSkippedStudent] = useState(false);

  const showStudentStep = !studentLinked && !skippedStudent;
  const studentResolved = studentLinked || skippedStudent;

  return (
    <div className="space-y-6">
      {/* Extracted answers — always visible so the teacher can check OCR quality */}
      {extractedAnswers.length > 0 && (
        <ExamPaperPanel
          gradingResults={[]}
          extractedAnswers={extractedAnswers}
          examPaperTitle="Extracted answers"
        />
      )}

      {showStudentStep && (
        <StudentLinker
          jobId={jobId}
          detectedStudentName={detectedStudentName}
          onSkip={() => setSkippedStudent(true)}
        />
      )}

      {studentResolved && !examPaperPreselected && (
        <ExamPaperSelector
          jobId={jobId}
          extractedAnswers={extractedAnswers}
          studentName={detectedStudentName}
          detectedSubject={detectedSubject}
        />
      )}
    </div>
  );
}
