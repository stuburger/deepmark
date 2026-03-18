"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createPdfIngestionUpload,
  getPdfIngestionJobStatus,
  createExamPaperFromJob,
  retriggerPdfIngestionJob,
  type PdfDocumentType,
} from "@/lib/pdf-ingestion-actions";
import type { Subject } from "@mcp-gcse/db";

const SUBJECTS: { value: Subject; label: string }[] = [
  { value: "biology", label: "Biology" },
  { value: "chemistry", label: "Chemistry" },
  { value: "physics", label: "Physics" },
  { value: "english", label: "English" },
];

const EXAM_BOARDS = ["AQA", "OCR", "Edexcel", "WJEC", "Other"];

type DetectedMetadata = {
  title?: string;
  subject?: string;
  exam_board?: string;
  total_marks?: number;
  duration_minutes?: number;
  year?: number;
};

export default function AdminUploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedExamPaperId = searchParams.get("exam_paper_id");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] =
    useState<PdfDocumentType>("mark_scheme");
  const [examBoard, setExamBoard] = useState("");
  const [subject, setSubject] = useState<Subject>("biology");
  const [year, setYear] = useState<string>("");
  const [paperReference, setPaperReference] = useState("");
  const [autoCreateExamPaper, setAutoCreateExamPaper] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detectedMetadata, setDetectedMetadata] =
    useState<DetectedMetadata | null>(null);
  const [showAmendmentForm, setShowAmendmentForm] = useState(false);
  const [amendTitle, setAmendTitle] = useState("");
  const [amendSubject, setAmendSubject] = useState<Subject>("biology");
  const [amendExamBoard, setAmendExamBoard] = useState("");
  const [amendTotalMarks, setAmendTotalMarks] = useState("");
  const [amendDuration, setAmendDuration] = useState("");
  const [amendYear, setAmendYear] = useState("");
  const [amendPaperNumber, setAmendPaperNumber] = useState("");
  const [creatingPaper, setCreatingPaper] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const pollStatus = useCallback(
    async (id: string) => {
      const result = await getPdfIngestionJobStatus(id);
      if (!result.ok) return;
      setStatus(result.status);
      setError(result.error);
      if (
        result.detected_exam_paper_metadata &&
        typeof result.detected_exam_paper_metadata === "object"
      ) {
        const meta = result.detected_exam_paper_metadata as DetectedMetadata;
        setDetectedMetadata(meta);
        setAmendTitle(meta.title ?? "");
        setAmendExamBoard(meta.exam_board ?? examBoard);
        setAmendTotalMarks(String(meta.total_marks ?? ""));
        setAmendDuration(String(meta.duration_minutes ?? ""));
        setAmendYear(meta.year != null ? String(meta.year) : "");
        const subj = meta.subject?.toLowerCase();
        if (
          subj === "biology" ||
          subj === "chemistry" ||
          subj === "physics" ||
          subj === "english"
        ) {
          setAmendSubject(subj);
        }
      }
      if (
        result.status === "ocr_complete" &&
        result.auto_create_exam_paper &&
        result.detected_exam_paper_metadata
      ) {
        setShowAmendmentForm(true);
      }
    },
    [examBoard]
  );

  useEffect(() => {
    if (!jobId || status === "ocr_complete" || status === "failed") return;
    const t = setInterval(() => pollStatus(jobId), 3000);
    return () => clearInterval(t);
  }, [jobId, status, pollStatus]);

  const upload = useCallback(
    async (file: File) => {
      if (!file.type.includes("pdf")) {
        setError("Please select a PDF file");
        return;
      }
      setError(null);
      setUploading(true);
      setShowAmendmentForm(false);
      setDetectedMetadata(null);
      try {
        const result = await createPdfIngestionUpload({
          document_type: documentType,
          exam_board: examBoard.trim() || "Other",
          subject,
          year: year ? parseInt(year, 10) : undefined,
          paper_reference: paperReference.trim() || undefined,
          auto_create_exam_paper: linkedExamPaperId
            ? false
            : documentType === "mark_scheme"
            ? autoCreateExamPaper
            : documentType === "question_paper"
            ? true
            : false,
          exam_paper_id: linkedExamPaperId ?? undefined,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setJobId(result.jobId);
        setStatus("pending");
        const putRes = await fetch(result.url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": "application/pdf" },
        });
        if (!putRes.ok) {
          setError("Upload to storage failed");
          return;
        }
        pollStatus(result.jobId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [
      documentType,
      examBoard,
      subject,
      year,
      paperReference,
      autoCreateExamPaper,
      linkedExamPaperId,
      pollStatus,
    ]
  );

  const handleRetry = useCallback(async () => {
    if (!jobId) return;
    setRetrying(true);
    setError(null);
    try {
      const result = await retriggerPdfIngestionJob(jobId);
      if (!result.ok) setError(result.error);
      else setStatus("pending");
    } finally {
      setRetrying(false);
    }
  }, [jobId]);

  const handleCreateExamPaper = useCallback(async () => {
    if (!jobId) return;
    setCreatingPaper(true);
    setError(null);
    try {
      const result = await createExamPaperFromJob({
        job_id: jobId,
        title: amendTitle || "Untitled Exam Paper",
        subject: amendSubject,
        exam_board: amendExamBoard || examBoard,
        total_marks: parseInt(amendTotalMarks, 10) || 0,
        duration_minutes: parseInt(amendDuration, 10) || 60,
        year: amendYear ? parseInt(amendYear, 10) : undefined,
        paper_number: amendPaperNumber
          ? parseInt(amendPaperNumber, 10)
          : undefined,
      });
      if (!result.ok) setError(result.error);
      else router.push(`/dashboard/upload`);
    } finally {
      setCreatingPaper(false);
    }
  }, [
    jobId,
    amendTitle,
    amendSubject,
    amendExamBoard,
    amendTotalMarks,
    amendDuration,
    amendYear,
    amendPaperNumber,
    examBoard,
    router,
  ]);

  const handleManualCreateExamPaper = useCallback(() => {
    if (detectedMetadata) {
      setAmendTitle(detectedMetadata.title ?? "");
      setAmendExamBoard(detectedMetadata.exam_board ?? examBoard);
      setAmendTotalMarks(String(detectedMetadata.total_marks ?? ""));
      setAmendDuration(String(detectedMetadata.duration_minutes ?? ""));
      setAmendYear(
        detectedMetadata.year != null ? String(detectedMetadata.year) : ""
      );
    } else {
      setAmendExamBoard(examBoard);
    }
    setShowAmendmentForm(true);
  }, [detectedMetadata, examBoard]);

  return (
    <div className="container max-w-2xl py-8">
      <Link href="/dashboard/upload">Back to PDF jobs</Link>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>PDF ingestion</CardTitle>
          <CardDescription>
            Upload a mark scheme, exemplar memo, or question paper PDF. Mark
            scheme and question paper uploads will prompt to create an exam
            paper from detected metadata.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {linkedExamPaperId && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              Uploading against existing exam paper. The amendment form will be skipped.
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Document type</label>
            <select
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              value={documentType}
              onChange={(e) =>
                setDocumentType(e.target.value as PdfDocumentType)
              }
            >
              <option value="mark_scheme">Mark scheme</option>
              <option value="exemplar">Exemplar memo</option>
              <option value="question_paper">Question paper</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Exam board</label>
            <select
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              value={examBoard}
              onChange={(e) => setExamBoard(e.target.value)}
            >
              {EXAM_BOARDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Subject</label>
            <select
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              value={subject}
              onChange={(e) => setSubject(e.target.value as Subject)}
            >
              {SUBJECTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {documentType === "mark_scheme" && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto-create"
                checked={autoCreateExamPaper}
                onChange={(e) => setAutoCreateExamPaper(e.target.checked)}
              />
              <label htmlFor="auto-create" className="text-sm font-medium">
                Create Exam Paper automatically (detect metadata and show
                amendment form)
              </label>
            </div>
          )}
          {documentType === "question_paper" && (
            <p className="text-sm text-muted-foreground">
              An exam paper will always be created from the detected metadata.
              You can review and amend it after processing.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Year (optional)</label>
              <input
                type="number"
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. 2024"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Paper reference (optional)
              </label>
              <input
                type="text"
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                value={paperReference}
                onChange={(e) => setPaperReference(e.target.value)}
                placeholder="e.g. 8132/1 H"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">PDF file</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
              disabled={uploading}
            />
          </div>
          {error && (
            <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {uploading && (
            <p className="text-sm text-muted-foreground">Uploading…</p>
          )}
          {jobId && status === "processing" && (
            <p className="text-sm text-muted-foreground">
              Processing PDF… (this may take a few minutes)
            </p>
          )}
          {jobId && status === "failed" && (
            <Button onClick={handleRetry} disabled={retrying}>
              {retrying ? "Retrying…" : "Retry"}
            </Button>
          )}
          {jobId &&
            status === "ocr_complete" &&
            !showAmendmentForm &&
            (documentType === "mark_scheme" ||
              documentType === "question_paper") && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {documentType === "question_paper"
                    ? "Questions imported. Review and create the exam paper."
                    : "Questions imported. You can create an exam paper from them."}
                </p>
                <Button onClick={handleManualCreateExamPaper}>
                  Create Exam Paper
                </Button>
              </div>
            )}
          {showAmendmentForm && !linkedExamPaperId && (
            <Card>
              <CardHeader>
                <CardTitle>Create Exam Paper</CardTitle>
                <CardDescription>
                  Review and amend the detected metadata, then confirm.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <input
                    type="text"
                    className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                    value={amendTitle}
                    onChange={(e) => setAmendTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subject</label>
                  <select
                    className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                    value={amendSubject}
                    onChange={(e) => setAmendSubject(e.target.value as Subject)}
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Exam board</label>
                  <input
                    type="text"
                    className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                    value={amendExamBoard}
                    onChange={(e) => setAmendExamBoard(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Total marks</label>
                    <input
                      type="number"
                      className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                      value={amendTotalMarks}
                      onChange={(e) => setAmendTotalMarks(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Duration (minutes)
                    </label>
                    <input
                      type="number"
                      className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                      value={amendDuration}
                      onChange={(e) => setAmendDuration(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Year (optional)
                    </label>
                    <input
                      type="number"
                      className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                      value={amendYear}
                      onChange={(e) => setAmendYear(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Paper number (optional)
                    </label>
                    <input
                      type="number"
                      className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                      value={amendPaperNumber}
                      onChange={(e) => setAmendPaperNumber(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleCreateExamPaper}
                  disabled={creatingPaper}
                >
                  {creatingPaper ? "Creating…" : "Confirm & Create Exam Paper"}
                </Button>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
