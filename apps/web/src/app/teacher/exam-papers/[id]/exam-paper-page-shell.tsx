"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ExamPaperDetail,
  SimilarPair,
  UnlinkedMarkScheme,
} from "@/lib/dashboard-actions";
import {
  deleteExamPaper,
  deleteQuestion,
  getSimilarQuestionsForPaper,
  getUnlinkedMarkSchemes,
  linkMarkSchemeToQuestion,
} from "@/lib/dashboard-actions";
import type { PdfDocument } from "@/lib/pdf-ingestion-actions";
import { getExamPaperIngestionLiveState } from "@/lib/pdf-ingestion-actions";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  LayoutList,
  Link2,
  Lock,
  ScrollText,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentUploadCards } from "./document-upload-cards";
import { EditableTitle } from "./editable-title";
import { ExamPaperPaperView } from "./exam-paper-paper-view";
import { ExamPaperQuestionSheet } from "./exam-paper-question-sheet";
import { UploadStudentScriptDialog } from "./upload-student-script-dialog";

type IngestionJob = {
  id: string;
  document_type: string;
  status: string;
  error: string | null;
};

const TERMINAL = new Set(["ocr_complete", "failed", "cancelled"]);
const POLL_MS = 3000;

type SortKey = "number" | "marks" | "similarity";
type SortDir = "asc" | "desc";

/**
 * Natural-sort comparison for question numbers like "1a", "2bii", "10".
 * Numbers within the string are compared numerically; letters lexicographically.
 */
function naturalCompare(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const re = /(\d+)|(\D+)/g;
  const partsA = [...a.matchAll(re)].map((m) => m[0]);
  const partsB = [...b.matchAll(re)].map((m) => m[0]);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const pa = partsA[i] ?? "";
    const pb = partsB[i] ?? "";
    const na = Number(pa);
    const nb = Number(pb);
    if (!isNaN(na) && !isNaN(nb)) {
      if (na !== nb) return na - nb;
    } else {
      if (pa < pb) return -1;
      if (pa > pb) return 1;
    }
  }
  return 0;
}

function schemeBadge(status: string | null) {
  if (!status) return <Badge variant="outline">No scheme</Badge>;
  switch (status) {
    case "linked":
    case "auto_linked":
      return <Badge variant="secondary">Has scheme</Badge>;
    case "unlinked":
      return <Badge variant="destructive">Unlinked</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function originBadgeVariant(origin: string) {
  switch (origin) {
    case "question_paper":
      return "default" as const;
    case "mark_scheme":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function originLabel(origin: string) {
  switch (origin) {
    case "question_paper":
      return "Question Paper";
    case "mark_scheme":
      return "Mark Scheme";
    case "exemplar":
      return "Exemplar";
    case "manual":
      return "Manual";
    default:
      return origin;
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function TableRowDeleteButton({
  questionId,
  onDeleted,
}: {
  questionId: string;
  onDeleted: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    const result = await deleteQuestion(questionId);
    setDeleting(false);
    if (result.ok) {
      onDeleted();
    }
    setConfirmOpen(false);
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        title="Delete question"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmOpen(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span className="sr-only">Delete question</span>
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!deleting) setConfirmOpen(next);
        }}
        title="Delete this question?"
        description="This will permanently remove the question, its mark scheme, and all associated data. This cannot be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete question"}
        loading={deleting}
        onConfirm={handleConfirm}
      />
    </>
  );
}

export function ExamPaperPageShell({ paper }: { paper: ExamPaperDetail }) {
  const router = useRouter();

  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [completedDocs, setCompletedDocs] = useState<PdfDocument[]>([]);
  const prevJobStatuses = useRef<Record<string, string>>({});

  // Similarity / duplicate detection
  const [similarPairs, setSimilarPairs] = useState<SimilarPair[]>([]);
  const [duplicateBannerDismissed, setDuplicateBannerDismissed] =
    useState(false);

  // Unlinked mark schemes
  const [unlinkedItems, setUnlinkedItems] = useState<UnlinkedMarkScheme[]>([]);
  const [linkingItem, setLinkingItem] = useState<UnlinkedMarkScheme | null>(
    null
  );
  const [linkingTargetId, setLinkingTargetId] = useState<string>("");
  const [linkingBusy, setLinkingBusy] = useState(false);
  const [linkingError, setLinkingError] = useState<string | null>(null);

  // Upload student script
  const [uploadScriptOpen, setUploadScriptOpen] = useState(false);

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Sort state
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "number",
    dir: "asc",
  });

  // View toggle + question sheet
  const [view, setView] = useState<"table" | "paper">("paper");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    null
  );

  /** Single poll for jobs + completed PDF docs (one server round-trip). */
  const fetchIngestionLiveState = useCallback(async () => {
    const r = await getExamPaperIngestionLiveState(paper.id);
    if (!r.ok) return;
    setJobs(r.jobs);
    setCompletedDocs(r.documents);
  }, [paper.id]);

  useEffect(() => {
    const run = () => void fetchIngestionLiveState();
    const initial = setTimeout(run, 0);
    const id = setInterval(run, POLL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [fetchIngestionLiveState]);

  useEffect(() => {
    const currentIds = new Set(jobs.map((j) => j.id));
    let shouldRefresh = false;

    // Successful completion: job becomes ocr_complete and drops out of the
    // "active jobs" list entirely, so we never see a terminal status in-array.
    for (const [id, prevStatus] of Object.entries(prevJobStatuses.current)) {
      if (!currentIds.has(id) && !TERMINAL.has(prevStatus)) {
        shouldRefresh = true;
        break;
      }
    }

    for (const job of jobs) {
      const prev = prevJobStatuses.current[job.id];
      if (
        prev !== undefined &&
        prev !== job.status &&
        TERMINAL.has(job.status)
      ) {
        shouldRefresh = true;
      }
      prevJobStatuses.current[job.id] = job.status;
    }

    for (const id of Object.keys(prevJobStatuses.current)) {
      if (!currentIds.has(id)) {
        delete prevJobStatuses.current[id];
      }
    }

    if (shouldRefresh) {
      router.refresh();
      getSimilarQuestionsForPaper(paper.id).then((r) => {
        if (r.ok) setSimilarPairs(r.pairs);
      });
      getUnlinkedMarkSchemes(paper.id).then((r) => {
        if (r.ok) setUnlinkedItems(r.items);
      });
    }
  }, [jobs, router, paper.id]);

  // Load similarity pairs once on mount (lazy, non-blocking)
  useEffect(() => {
    getSimilarQuestionsForPaper(paper.id).then((r) => {
      if (r.ok) setSimilarPairs(r.pairs);
    });
  }, [paper.id]);

  // Load unlinked mark schemes on mount (lazy, non-blocking)
  useEffect(() => {
    getUnlinkedMarkSchemes(paper.id).then((r) => {
      if (r.ok) setUnlinkedItems(r.items);
    });
  }, [paper.id]);

  async function handleLinkMarkScheme() {
    if (!linkingItem || !linkingTargetId) return;
    setLinkingBusy(true);
    setLinkingError(null);
    const result = await linkMarkSchemeToQuestion(
      linkingItem.ghostQuestionId,
      linkingTargetId
    );
    setLinkingBusy(false);
    if (!result.ok) {
      setLinkingError(result.error);
      return;
    }
    setLinkingItem(null);
    setLinkingTargetId("");
    router.refresh();
    // Re-fetch unlinked items after linking
    getUnlinkedMarkSchemes(paper.id).then((r) => {
      if (r.ok) setUnlinkedItems(r.items);
    });
  }

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteExamPaper(paper.id);
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    router.push("/teacher/exam-papers");
  }

  // Build a set of question IDs that have at least one similar pair
  const duplicateIds = new Set(
    similarPairs.flatMap((p) => [p.questionId, p.similarToId])
  );

  const hasQuestionPaperDocument = completedDocs.some(
    (d) => d.document_type === "question_paper"
  );
  const hasQuestionPaperQuestions = paper.questions.some(
    (q) => q.origin === "question_paper"
  );
  const hasQuestionPaper =
    hasQuestionPaperDocument || hasQuestionPaperQuestions;

  const totalQuestions = paper.questions.length;
  const questionsWithMarkScheme = paper.questions.filter(
    (q) =>
      q.mark_scheme_status === "linked" ||
      q.mark_scheme_status === "auto_linked"
  ).length;
  const allQuestionsHaveMarkSchemes =
    totalQuestions > 0 && questionsWithMarkScheme === totalQuestions;

  const hasExemplarDocument = completedDocs.some(
    (d) => d.document_type === "exemplar"
  );
  const hasExemplarQuestions = paper.questions.some(
    (q) => q.origin === "exemplar"
  );
  const hasExemplar = hasExemplarDocument || hasExemplarQuestions;

  const readyForSubmissions = hasQuestionPaper && allQuestionsHaveMarkSchemes;

  // Sort questions client-side
  const sortedQuestions = [...paper.questions].sort((a, b) => {
    let cmp = 0;
    if (sort.key === "number") {
      cmp = naturalCompare(a.question_number, b.question_number);
      if (cmp === 0) cmp = a.order - b.order;
    } else if (sort.key === "marks") {
      const pa = a.points ?? -1;
      const pb = b.points ?? -1;
      cmp = pa - pb;
    } else if (sort.key === "similarity") {
      // Duplicates first (group them), then by question number
      const aDup = duplicateIds.has(a.id) ? 0 : 1;
      const bDup = duplicateIds.has(b.id) ? 0 : 1;
      cmp = aDup - bDup;
      if (cmp === 0) {
        // Within duplicates, group actual pairs together
        const aPairId =
          similarPairs.find(
            (p) => p.questionId === a.id || p.similarToId === a.id
          )?.questionId ?? "";
        const bPairId =
          similarPairs.find(
            (p) => p.questionId === b.id || p.similarToId === b.id
          )?.questionId ?? "";
        cmp = aPairId.localeCompare(bPairId);
      }
      if (cmp === 0) cmp = naturalCompare(a.question_number, b.question_number);
    }
    return sort.dir === "asc" ? cmp : -cmp;
  });

  return (
    <>
      {/* Header */}
      <div>
        <Link
          href="/teacher/exam-papers"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to exam papers
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <EditableTitle id={paper.id} initialTitle={paper.title} />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{capitalize(paper.subject)}</Badge>
              {paper.exam_board && <span>{paper.exam_board}</span>}
              <span>{paper.year}</span>
              {paper.paper_number && <span>Paper {paper.paper_number}</span>}
              {paper.is_public ? (
                <Badge variant="default" className="gap-1">
                  <Globe className="h-3 w-3" /> Public
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <Lock className="h-3 w-3" /> Draft
                </Badge>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Delete paper</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Readiness strip */}
      <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
        <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          <span
            className={`flex items-center gap-1.5 ${
              hasQuestionPaper
                ? "text-green-600 dark:text-green-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                hasQuestionPaper ? "bg-green-500" : "bg-amber-500"
              }`}
            />
            Question paper
          </span>
          <span
            className={`flex items-center gap-1.5 ${
              allQuestionsHaveMarkSchemes
                ? "text-green-600 dark:text-green-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                allQuestionsHaveMarkSchemes ? "bg-green-500" : "bg-amber-500"
              }`}
            />
            Mark schemes
            {!allQuestionsHaveMarkSchemes && totalQuestions > 0 && (
              <span className="tabular-nums">
                ({questionsWithMarkScheme}/{totalQuestions})
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                hasExemplar ? "bg-green-500" : "bg-muted-foreground/40"
              }`}
            />
            Exemplars (optional)
          </span>
        </div>
        {readyForSubmissions ? (
          <button
            type="button"
            onClick={() => setUploadScriptOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-500/20 dark:text-green-400"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Start marking!
          </button>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground/60">
            Not ready
          </span>
        )}
      </div>

      {/* Document upload cards */}
      <DocumentUploadCards
        examPaperId={paper.id}
        completedDocs={completedDocs}
        activeJobs={jobs}
        onJobStarted={() => void fetchIngestionLiveState()}
      />

      {/* Duplicate warning banner */}
      {similarPairs.length > 0 && !duplicateBannerDismissed && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-500/5 px-3 py-2.5 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="flex-1 text-amber-800 dark:text-amber-200">
            {similarPairs.length} potential duplicate question
            {similarPairs.length !== 1 ? "s" : ""} detected — rows marked with a
            dot may need review.{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => setSort({ key: "similarity", dir: "asc" })}
            >
              Sort by similarity
            </button>{" "}
            to group them.
          </span>
          <button
            type="button"
            className="shrink-0 text-xs text-amber-600 hover:text-amber-900 dark:text-amber-400"
            onClick={() => setDuplicateBannerDismissed(true)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Unlinked mark schemes panel */}
      {unlinkedItems.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              {unlinkedItems.length} unlinked mark scheme
              {unlinkedItems.length !== 1 ? "s" : ""} — created during ingestion
              but not matched to a question
            </p>
          </div>
          <div className="space-y-2">
            {unlinkedItems.map((item) => (
              <div
                key={item.markSchemeId}
                className="flex items-start justify-between gap-3 rounded-md bg-background border px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  {item.ghostQuestionNumber && (
                    <p className="text-xs text-muted-foreground mb-0.5">
                      Extracted as Q{item.ghostQuestionNumber}
                    </p>
                  )}
                  <p
                    className="text-sm truncate"
                    title={item.ghostQuestionText}
                  >
                    {item.ghostQuestionText}
                  </p>
                  {item.markSchemeDescription && (
                    <p
                      className="text-xs text-muted-foreground truncate mt-0.5"
                      title={item.markSchemeDescription}
                    >
                      Mark scheme: {item.markSchemeDescription}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {item.pointsTotal} mark{item.pointsTotal !== 1 ? "s" : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    setLinkingItem(item);
                    setLinkingTargetId("");
                    setLinkingError(null);
                  }}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  Link to question
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Link mark scheme dialog */}
      <Dialog
        open={linkingItem !== null}
        onOpenChange={(open) => {
          if (!linkingBusy) {
            setLinkingItem(open ? linkingItem : null);
            if (!open) setLinkingError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link mark scheme to question</DialogTitle>
            <DialogDescription>
              Choose which question in this paper should receive this mark
              scheme. Only questions without a mark scheme are shown.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {paper.questions
                .filter((q) => q.mark_scheme_status === null)
                .map((q) => (
                  <label
                    key={q.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      linkingTargetId === q.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="link-target"
                      value={q.id}
                      checked={linkingTargetId === q.id}
                      onChange={() => setLinkingTargetId(q.id)}
                      className="mt-0.5"
                      disabled={linkingBusy}
                    />
                    <div className="min-w-0">
                      {q.question_number && (
                        <p className="text-xs text-muted-foreground">
                          Q{q.question_number}
                        </p>
                      )}
                      <p className="text-sm line-clamp-2">{q.text}</p>
                    </div>
                  </label>
                ))}
              {paper.questions.filter((q) => q.mark_scheme_status === null)
                .length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  All questions already have a mark scheme.
                </p>
              )}
            </div>
            {linkingError && (
              <p className="text-sm text-destructive">{linkingError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                disabled={linkingBusy}
                onClick={() => {
                  setLinkingItem(null);
                  setLinkingError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!linkingTargetId || linkingBusy}
                onClick={handleLinkMarkScheme}
              >
                {linkingBusy ? (
                  <>
                    <Spinner className="h-3.5 w-3.5 mr-1.5" />
                    Linking…
                  </>
                ) : (
                  "Link mark scheme"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Questions */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-1 rounded-md border p-0.5 shrink-0">
              <button
                type="button"
                title="Exam paper view"
                onClick={() => setView("paper")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  view === "paper"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ScrollText className="h-3.5 w-3.5" />
                Paper
              </button>

              <button
                type="button"
                title="Table view"
                onClick={() => setView("table")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  view === "table"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutList className="h-3.5 w-3.5" />
                Table
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {view === "paper" ? (
            <ExamPaperPaperView
              paper={paper}
              onQuestionClick={(id) => setSelectedQuestionId(id)}
            />
          ) : paper.questions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No questions yet. Upload a question paper or mark scheme PDF to
              populate this paper.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs font-medium hover:text-foreground"
                      onClick={() => toggleSort("number")}
                    >
                      #
                      {sort.key === "number" ? (
                        sort.dir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs font-medium hover:text-foreground"
                      onClick={() => toggleSort("marks")}
                    >
                      Marks
                      {sort.key === "marks" ? (
                        sort.dir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>Mark scheme</TableHead>
                  <TableHead className="w-8">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs font-medium hover:text-foreground"
                      onClick={() => toggleSort("similarity")}
                      title="Sort by similarity to group potential duplicates"
                    >
                      <ArrowUpDown
                        className={`h-3 w-3 ${
                          sort.key === "similarity" ? "" : "opacity-40"
                        }`}
                      />
                    </button>
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedQuestions.map((q) => {
                  const isDuplicate = duplicateIds.has(q.id);
                  return (
                    <TableRow
                      key={q.id}
                      className="cursor-pointer hover:bg-muted/50 group"
                    >
                      <TableCell className="text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          {isDuplicate && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                              title="Potential duplicate"
                            />
                          )}
                          <button
                            type="button"
                            className="hover:underline underline-offset-4 text-left"
                            onClick={() => setSelectedQuestionId(q.id)}
                          >
                            {q.question_number ?? q.order}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {q.section_title}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <button
                          type="button"
                          className="hover:underline underline-offset-4 text-left w-full"
                          title={q.text}
                          onClick={() => setSelectedQuestionId(q.id)}
                        >
                          <p className="truncate text-sm">{q.text}</p>
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant={originBadgeVariant(q.origin)}>
                          {originLabel(q.origin)}
                        </Badge>
                      </TableCell>
                      <TableCell>{q.points ?? "—"}</TableCell>
                      <TableCell>{schemeBadge(q.mark_scheme_status)}</TableCell>
                      <TableCell />
                      <TableCell>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          <Link
                            href={`/teacher/exam-papers/${paper.id}/questions/${q.id}`}
                            className="text-muted-foreground hover:text-foreground"
                            title="Open full view"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="sr-only">Open full view</span>
                          </Link>
                          <TableRowDeleteButton
                            questionId={q.id}
                            onDeleted={() => router.refresh()}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ExamPaperQuestionSheet
        open={selectedQuestionId !== null}
        onClose={() => setSelectedQuestionId(null)}
        questionId={selectedQuestionId}
        paperId={paper.id}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteDialogOpen(open);
        }}
        title="Delete exam paper?"
        description={`This will permanently delete "${paper.title}" along with all its questions, mark schemes, and uploaded PDFs. This cannot be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete paper"}
        loading={deleting}
        onConfirm={handleDelete}
      />

      {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}

      <UploadStudentScriptDialog
        examPaperId={paper.id}
        open={uploadScriptOpen}
        onOpenChange={setUploadScriptOpen}
      />
    </>
  );
}
