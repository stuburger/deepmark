"use client"

import { Button } from "@/components/ui/button"
import { getPaperSetupSession } from "@/lib/paper-setup/queries"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { AlertCircle, FileText, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

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
		refetchInterval: (q) =>
			q.state.data?.status === "extracting" ? POLL_MS : false,
	})

	useEffect(() => {
		if (session?.status === "completed") {
			router.replace(`/teacher/exam-papers/${session.examPaperId}`)
		}
	}, [session, router])

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

	if (session.status === "failed") {
		return (
			<div className="space-y-4">
				<div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
					<AlertCircle className="size-5 shrink-0 text-destructive" />
					<div className="space-y-1">
						<p className="text-sm font-medium text-foreground">
							Extraction failed
						</p>
						<p className="text-sm text-muted-foreground">
							{session.error ?? "The bundle processor was unable to extract the paper."}
						</p>
					</div>
				</div>
				<Button
					nativeButton={false}
					render={<Link href="/teacher/papers/new" />}
				>
					Try again
				</Button>
			</div>
		)
	}

	// extracting
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<p className="text-xs uppercase tracking-wide text-ink-tertiary">
					Step 2 · Extracting
				</p>
				<h1 className="text-2xl font-semibold text-foreground">
					Reading your paper
				</h1>
				<p className="text-sm text-muted-foreground">
					We're combining your question paper and mark scheme into a linked
					structure. This usually takes 30–90 seconds.
				</p>
			</div>

			<div className="rounded-lg border border-border bg-card p-4">
				<div className="flex items-center gap-3">
					<Loader2 className="size-5 animate-spin text-primary" />
					<div className="flex-1">
						<p className="text-sm font-medium text-foreground">
							Extracting metadata, questions, and mark scheme
						</p>
						<p className="text-xs text-muted-foreground mt-0.5">
							Bundle processor · single Gemini call · started{" "}
							{formatElapsed(session.createdAt)} ago
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

function formatElapsed(start: Date | string): string {
	const startMs = new Date(start).getTime()
	const seconds = Math.max(0, Math.round((Date.now() - startMs) / 1000))
	if (seconds < 60) return `${seconds}s`
	const mins = Math.floor(seconds / 60)
	const rem = seconds % 60
	return `${mins}m ${rem}s`
}
