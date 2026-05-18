"use client"

import { StagingReviewDialog } from "@/app/teacher/exam-papers/[id]/staging-review-dialog"
import { PaperSetupStepper } from "@/components/paper-setup/stepper"
import { Button } from "@/components/ui/button"
import { useBatchIngestion } from "@/lib/batch/lifecycle/use-ingestion"
import { formatElapsedShort } from "@/lib/format/date"
import { getPaperSetupSession } from "@/lib/paper-setup/queries"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { AlertCircle, FileText, Loader2, Pencil, Play } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { LowConfidenceBanner } from "./low-confidence-banner"
import { ScriptSummary } from "./script-summary"
import { SegmentingPanel } from "./segmenting-panel"

const POLL_MS = 3000

export function SessionLiveView({ sessionId }: { sessionId: string }) {
	const router = useRouter()

	const { data: session, isLoading } = useQuery({
		queryKey: queryKeys.paperSetupSession(sessionId),
		queryFn: async () => {
			const r = await getPaperSetupSession({ sessionId })
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data?.session ?? null
		},
		refetchInterval: (q) => {
			const data = q.state.data
			if (!data) return POLL_MS
			const bundleDone = data.examPaperId !== null
			const bundleFailed = data.error !== null && !bundleDone
			// `staging` and `committed` both mean classification is finished.
			// `committed` is a transient post-commit state — by the time we
			// see it, the user is already navigating to the shell.
			const segDone =
				data.batch === null ||
				data.batch.status === "staging" ||
				data.batch.status === "committed"
			const segFailed = data.batch?.status === "failed"
			const terminal = bundleFailed || segFailed || (bundleDone && segDone)
			return terminal ? false : POLL_MS
		},
	})

	if (isLoading) {
		return (
			<div className="flex items-center gap-3 text-muted-foreground">
				<Loader2 className="size-4 animate-spin" />
				<span>Loading session…</span>
			</div>
		)
	}

	if (!session) {
		return (
			<div className="space-y-4">
				<p className="text-sm text-muted-foreground">Session not found.</p>
				<Button
					variant="outline"
					nativeButton={false}
					render={<Link href="/teacher/papers/new" />}
				>
					Start over
				</Button>
			</div>
		)
	}

	const bundleDone = session.examPaperId !== null
	const bundleFailed = session.error !== null && !bundleDone
	const hasScripts = session.batch !== null
	const segmentationDone =
		!hasScripts ||
		session.batch?.status === "staging" ||
		session.batch?.status === "committed"
	const segmentationFailed = session.batch?.status === "failed"
	const allDone = bundleDone && segmentationDone
	const currentStep: "extract" | "scripts" | "done" = allDone
		? "done"
		: bundleDone && !segmentationDone
			? "scripts"
			: "extract"

	const stepper = (
		<PaperSetupStepper
			current={currentStep}
			hasScripts={hasScripts}
			extractDone={bundleDone}
			extractFailed={bundleFailed}
			segmentationDone={segmentationDone}
			segmentationFailed={segmentationFailed}
		/>
	)

	if (bundleFailed) {
		return (
			<div className="space-y-6">
				{stepper}
				<FailurePanel
					title="Extraction failed"
					message={
						session.error ??
						"The bundle processor was unable to extract the paper."
					}
				/>
			</div>
		)
	}

	if (segmentationFailed) {
		return (
			<div className="space-y-6">
				{stepper}
				<FailurePanel
					title="Segmentation failed"
					message={
						session.batch?.error ??
						"The script segmenter was unable to read the upload."
					}
				/>
			</div>
		)
	}

	if (allDone && bundleDone && session.examPaperId) {
		return (
			<CompletedState
				examPaperId={session.examPaperId}
				stepper={stepper}
				scripts={session.scripts}
				lowConfidenceCount={session.lowConfidenceCount}
				hasScripts={hasScripts}
				onExit={() =>
					router.replace(`/teacher/exam-papers/${session.examPaperId}`)
				}
			/>
		)
	}

	if (bundleDone && !segmentationDone) {
		return (
			<div className="space-y-6">
				{stepper}
				<SegmentingPanel createdAt={session.createdAt} scriptsFilename={null} />
			</div>
		)
	}

	// Bundle still running (with or without scripts in parallel).
	return (
		<div className="space-y-6">
			{stepper}
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					Reading your paper
				</h1>
				<p className="text-sm text-muted-foreground">
					We're combining your question paper and mark scheme into a linked
					structure. This usually takes 30–90 seconds.
					{hasScripts && " Your scripts are being segmented in parallel."}
				</p>
			</div>

			<div className="rounded-lg border border-border bg-card p-4">
				<div className="flex items-center gap-3">
					<Loader2 className="size-5 animate-spin text-primary" />
					<div className="flex-1">
						<p className="text-sm font-medium text-foreground">
							Extracting metadata, questions, and mark scheme
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Bundle processor · single Gemini call · started{" "}
							{formatElapsedShort(session.createdAt)} ago
						</p>
					</div>
				</div>
			</div>

			<div className="flex items-center gap-3 text-xs text-muted-foreground">
				<FileText className="size-3.5" />
				<span>
					You can close this tab — we'll keep working in the background.
				</span>
			</div>
		</div>
	)
}

/**
 * All-done branch. Shows the wizard's summary screen by default; the shell's
 * StagingReviewDialog opens on demand when the teacher clicks Review or a
 * thumbnail. "Start marking" commits via the same flow the shell uses.
 */
function CompletedState({
	examPaperId,
	stepper,
	scripts,
	lowConfidenceCount,
	hasScripts,
	onExit,
}: {
	examPaperId: string
	stepper: React.ReactElement
	scripts: Array<{
		id: string
		proposedName: string | null
		confirmedName: string | null
		status: "proposed" | "confirmed" | "excluded" | "submitted"
		confidence: number | null
		isLowConfidence: boolean
		thumbnailUrl: string
	}>
	lowConfidenceCount: number
	hasScripts: boolean
	onExit: () => void
}) {
	const [reviewOpen, setReviewOpen] = useState(false)
	const {
		ingestion,
		committingBatch,
		handleCommitAll,
		handleSplitScript,
		handleAddScript,
		handleUpdateScriptName,
		handleToggleExclude,
		handleToggleIncludeAll,
	} = useBatchIngestion(examPaperId, {
		onCommitSuccess: onExit,
	})

	if (!hasScripts) {
		return (
			<div className="space-y-6">
				{stepper}
				<div className="space-y-2">
					<h1 className="text-2xl font-semibold text-foreground">
						Paper ready
					</h1>
					<p className="text-sm text-muted-foreground">
						Your paper is ready. Open it to upload scripts when you're ready.
					</p>
				</div>
				<div className="flex items-center justify-end gap-3">
					<Button
						nativeButton={false}
						render={<Link href={`/teacher/exam-papers/${examPaperId}`} />}
					>
						Open paper
					</Button>
				</div>
			</div>
		)
	}

	const confirmedCount = scripts.filter((s) => s.status === "confirmed").length

	return (
		<div className="space-y-6">
			{stepper}
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{`All ready — ${confirmedCount} script${confirmedCount === 1 ? "" : "s"}`}
				</h1>
				<p className="text-sm text-muted-foreground">
					Click any thumbnail to preview pages, or hit Review to rearrange or
					exclude scripts. Start marking when you're ready.
				</p>
			</div>

			<LowConfidenceBanner
				count={lowConfidenceCount}
				onReview={() => setReviewOpen(true)}
			/>

			<ScriptSummary
				scripts={scripts}
				onOpenReview={() => setReviewOpen(true)}
			/>

			<div className="flex items-center justify-end gap-3">
				<Button variant="outline" onClick={() => setReviewOpen(true)}>
					<Pencil className="size-4" />
					Review / rearrange
				</Button>
				<Button
					onClick={() => {
						void handleCommitAll()
					}}
					disabled={committingBatch || confirmedCount === 0}
				>
					<Play className="size-4" />
					{committingBatch
						? "Starting…"
						: `Start marking ${confirmedCount} script${confirmedCount === 1 ? "" : "s"}`}
				</Button>
			</div>

			<StagingReviewDialog
				open={reviewOpen}
				onOpenChange={setReviewOpen}
				ingestion={ingestion}
				committingBatch={committingBatch}
				onCommitAll={handleCommitAll}
				onUpdateScriptName={handleUpdateScriptName}
				onToggleExclude={handleToggleExclude}
				onToggleIncludeAll={handleToggleIncludeAll}
				onSplitScript={handleSplitScript}
				onDeleteScript={() => {
					/* dialog handles list-side state */
				}}
				onAddScript={handleAddScript}
			/>
		</div>
	)
}

function FailurePanel({
	title,
	message,
}: {
	title: string
	message: string
}) {
	return (
		<div className="space-y-4">
			<div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
				<AlertCircle className="size-5 shrink-0 text-destructive" />
				<div className="space-y-1">
					<p className="text-sm font-medium text-foreground">{title}</p>
					<p className="text-sm text-muted-foreground">{message}</p>
				</div>
			</div>
			<Button nativeButton={false} render={<Link href="/teacher/papers/new" />}>
				Try again
			</Button>
		</div>
	)
}
