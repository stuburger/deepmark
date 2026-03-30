"use client"

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { SubmissionHistoryItem } from "@/lib/mark-actions"
import { LayoutGrid, List } from "lucide-react"
import { parseAsStringEnum, useQueryState } from "nuqs"

function formatDate(date: Date) {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(new Date(date))
}

function scoreColour(pct: number | null) {
	if (pct === null) return null
	if (pct >= 70)
		return {
			chip: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
			dot: "bg-green-500",
		}
	if (pct >= 40)
		return {
			chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
			dot: "bg-amber-500",
		}
	return {
		chip: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
		dot: "bg-red-500",
	}
}

function statusDot(status: string, pct: number | null) {
	if (pct !== null) {
		const c = scoreColour(pct)
		return c?.dot ?? "bg-muted-foreground"
	}
	switch (status) {
		case "failed":
		case "cancelled":
			return "bg-red-500"
		case "ocr_complete":
			return "bg-green-500"
		default:
			return "bg-amber-400"
	}
}

function statusLabel(status: string) {
	return status.replace(/_/g, " ")
}

const TERMINAL_STATUSES = new Set(["ocr_complete", "failed", "cancelled"])

// ─── Single script card ────────────────────────────────────────────────────────

function ScriptCard({
	sub,
	onView,
}: { sub: SubmissionHistoryItem; onView: () => void }) {
	const pct =
		sub.total_max > 0
			? Math.round((sub.total_awarded / sub.total_max) * 100)
			: null
	const colours = scoreColour(pct)
	const dot = statusDot(sub.status, pct)

	return (
		<button
			type="button"
			onClick={onView}
			className="text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
		>
			<Card className="group/script gap-0 py-0 hover:ring-foreground/20 transition-shadow cursor-pointer bg-amber-50/40 dark:bg-amber-950/10 h-full">
				<CardHeader className="pt-4 pb-0 px-4">
					<div className="flex items-start justify-between gap-2">
						<p className="text-sm font-medium italic leading-snug line-clamp-1 flex-1">
							{sub.student_name ?? (
								<span className="text-muted-foreground not-italic">
									Unnamed student
								</span>
							)}
						</p>
						{/* Status dot */}
						<span
							className={`mt-1 shrink-0 h-2.5 w-2.5 rounded-full ${dot}`}
							title={statusLabel(sub.status)}
						/>
					</div>
				</CardHeader>

				{/* Ruled lines — the notebook motif */}
				<CardContent className="px-4 pt-3 pb-2 flex flex-col gap-2.5">
					<div className="border-b border-muted/70" />
					<div className="border-b border-muted/70" />
					<div className="border-b border-muted/70" />
					<div className="border-b border-muted/70" />
				</CardContent>

				<CardFooter className="px-4 py-3 flex items-center justify-between border-t bg-muted/30">
					{pct !== null ? (
						<span
							className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${colours?.chip}`}
						>
							{sub.total_awarded}/{sub.total_max}
							<span className="font-bold">{pct}%</span>
						</span>
					) : (
						<span className="text-xs text-muted-foreground capitalize">
							{statusLabel(sub.status)}
						</span>
					)}
					<span className="text-xs text-muted-foreground tabular-nums">
						{formatDate(sub.created_at)}
					</span>
				</CardFooter>
			</Card>
		</button>
	)
}

// ─── Toggle button ─────────────────────────────────────────────────────────────

function ViewToggle({
	value,
	onChange,
}: { value: "grid" | "table"; onChange: (v: "grid" | "table") => void }) {
	return (
		<div className="flex items-center gap-0.5 rounded-md border p-0.5">
			<button
				type="button"
				onClick={() => onChange("grid")}
				className={`rounded p-1 transition-colors ${
					value === "grid"
						? "bg-muted text-foreground"
						: "text-muted-foreground hover:text-foreground"
				}`}
				aria-label="Grid view"
			>
				<LayoutGrid className="h-4 w-4" />
			</button>
			<button
				type="button"
				onClick={() => onChange("table")}
				className={`rounded p-1 transition-colors ${
					value === "table"
						? "bg-muted text-foreground"
						: "text-muted-foreground hover:text-foreground"
				}`}
				aria-label="Table view"
			>
				<List className="h-4 w-4" />
			</button>
		</div>
	)
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function SubmissionGrid({
	submissions,
	onView,
}: {
	submissions: SubmissionHistoryItem[]
	onView: (id: string) => void
}) {
	const [subView, setSubView] = useQueryState(
		"submissions_view",
		parseAsStringEnum(["grid", "table"]).withDefault("grid"),
	)
	const [subTab, setSubTab] = useQueryState(
		"submissions_tab",
		parseAsStringEnum(["complete", "backlog"]).withDefault("complete"),
	)

	const complete = submissions.filter((s) => TERMINAL_STATUSES.has(s.status))
	const backlog = submissions.filter((s) => !TERMINAL_STATUSES.has(s.status))
	const visible = subTab === "complete" ? complete : backlog

	return (
		<div className="space-y-4">
			<Tabs
				value={subTab}
				onValueChange={(v) => setSubTab(v as "complete" | "backlog")}
			>
				<TabsList>
					<TabsTrigger value="complete">
						Complete
						<span className="ml-1.5 rounded-full bg-background/60 px-1.5 py-0.5 text-xs tabular-nums">
							{complete.length}
						</span>
					</TabsTrigger>
					<TabsTrigger value="backlog">
						Backlog
						<span className="ml-1.5 rounded-full bg-background/60 px-1.5 py-0.5 text-xs tabular-nums">
							{backlog.length}
						</span>
					</TabsTrigger>
				</TabsList>
			</Tabs>

			{/* Header row: count + view toggle */}
			<div className="flex items-center justify-between gap-4">
				<p className="text-sm text-muted-foreground">
					{visible.length === 0
						? "No submissions yet."
						: `${visible.length} submission${visible.length !== 1 ? "s" : ""}`}
				</p>
				{visible.length > 0 && (
					<ViewToggle value={subView} onChange={setSubView} />
				)}
			</div>

			{subView === "grid" ? (
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
					{visible.map((sub) => (
						<ScriptCard key={sub.id} sub={sub} onView={() => onView(sub.id)} />
					))}
				</div>
			) : (
				<Card>
					<CardContent className="pt-4">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Student</TableHead>
									<TableHead>Score</TableHead>
									<TableHead>Date</TableHead>
									<TableHead className="w-16" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{visible.map((sub) => {
									const pct =
										sub.total_max > 0
											? Math.round((sub.total_awarded / sub.total_max) * 100)
											: null
									const colours = scoreColour(pct)
									return (
										<TableRow key={sub.id}>
											<TableCell className="text-sm">
												{sub.student_name ?? (
													<span className="text-muted-foreground italic">
														Unnamed
													</span>
												)}
											</TableCell>
											<TableCell>
												{pct !== null ? (
													<span
														className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${colours?.chip}`}
													>
														{sub.total_awarded}/{sub.total_max} · {pct}%
													</span>
												) : (
													<span className="text-xs text-muted-foreground capitalize">
														{statusLabel(sub.status)}
													</span>
												)}
											</TableCell>
											<TableCell className="text-xs text-muted-foreground tabular-nums">
												{formatDate(sub.created_at)}
											</TableCell>
											<TableCell>
												<button
													type="button"
													onClick={() => onView(sub.id)}
													className="text-xs text-muted-foreground hover:text-foreground transition-colors"
												>
													View
												</button>
											</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
