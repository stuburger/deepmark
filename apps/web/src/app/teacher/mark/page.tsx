import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button-variants"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { listMySubmissions } from "@/lib/marking/queries"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { PlusCircle } from "lucide-react"
import Link from "next/link"

function formatDate(date: Date) {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(date))
}

function scoreBadgeVariant(
	awarded: number,
	max: number,
): "default" | "secondary" | "destructive" | "outline" {
	if (max === 0) return "outline"
	const pct = (awarded / max) * 100
	if (pct >= 70) return "default"
	if (pct >= 40) return "secondary"
	return "destructive"
}

function statusBadgeVariant(
	status: string,
): "default" | "secondary" | "destructive" | "outline" {
	switch (status) {
		case "ocr_complete":
			return "secondary"
		case "processing":
			return "default"
		case "failed":
			return "destructive"
		default:
			return "outline"
	}
}

function submissionHref(sub: SubmissionHistoryItem): string {
	if (sub.exam_paper_id) {
		return `/teacher/mark/papers/${sub.exam_paper_id}/submissions/${sub.id}`
	}
	// Fallback: old route will redirect to new URL once exam_paper_id is known
	return `/teacher/mark/${sub.id}`
}

function SubmissionRow({ sub }: { sub: SubmissionHistoryItem }) {
	const href = submissionHref(sub)
	const scorePercent =
		sub.total_max > 0
			? Math.round((sub.total_awarded / sub.total_max) * 100)
			: null

	return (
		<TableRow className="cursor-pointer hover:bg-muted/50">
			<TableCell>
				<Link href={href} className="block">
					{sub.student_name ? (
						<span className="font-medium">{sub.student_name}</span>
					) : (
						<span className="text-muted-foreground italic">
							Unknown student
						</span>
					)}
				</Link>
			</TableCell>
			<TableCell className="max-w-xs">
				{sub.exam_paper_id ? (
					<Link
						href={`/teacher/exam-papers/${sub.exam_paper_id}`}
						className="text-sm hover:underline underline-offset-4 truncate block"
					>
						{sub.exam_paper_title ?? "Unknown paper"}
					</Link>
				) : (
					<span className="text-muted-foreground text-sm">
						{sub.exam_paper_title ?? "—"}
					</span>
				)}
			</TableCell>
			<TableCell>
				{sub.status === "ocr_complete" && sub.total_max > 0 ? (
					<Badge
						variant={scoreBadgeVariant(sub.total_awarded, sub.total_max)}
						className="tabular-nums"
					>
						{sub.total_awarded}/{sub.total_max}
						{scorePercent !== null && (
							<span className="ml-1 opacity-75">({scorePercent}%)</span>
						)}
					</Badge>
				) : (
					<Badge variant={statusBadgeVariant(sub.status)}>
						{sub.status === "ocr_complete" ? "No results" : sub.status}
					</Badge>
				)}
			</TableCell>
			<TableCell className="text-muted-foreground text-sm whitespace-nowrap">
				{formatDate(sub.created_at)}
			</TableCell>
			<TableCell>
				<Link
					href={href}
					className="text-sm text-primary underline underline-offset-4 hover:no-underline"
				>
					{sub.status === "ocr_complete" ? "View" : "Details"}
				</Link>
			</TableCell>
		</TableRow>
	)
}

export default async function MarkPage() {
	const result = await listMySubmissions()
	const submissions = result.ok ? result.submissions : []
	const completed = submissions.filter((s) => s.status === "ocr_complete")

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Mark a paper</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Upload a student&apos;s answer sheet and get it marked instantly
						against the official mark scheme.
					</p>
				</div>
				<Link
					href="/teacher/exam-papers"
					className={buttonVariants({ size: "lg" })}
				>
					<PlusCircle className="h-4 w-4 mr-2" />
					Browse exam papers
				</Link>
			</div>

			{submissions.length === 0 ? (
				<Card>
					<CardContent className="py-16 flex flex-col items-center text-center space-y-4">
						<div className="rounded-full bg-muted p-4">
							<PlusCircle className="h-8 w-8 text-muted-foreground" />
						</div>
						<div>
							<h2 className="font-semibold text-lg">No papers marked yet</h2>
							<p className="text-sm text-muted-foreground mt-1 max-w-sm">
								Select an exam paper and upload a student&apos;s answer sheet.
								Results appear in under a minute.
							</p>
						</div>
						<Link
							href="/teacher/exam-papers"
							className={buttonVariants({ size: "lg" })}
						>
							<PlusCircle className="h-4 w-4 mr-2" />
							Browse exam papers
						</Link>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>
							Marking history
							<span className="ml-2 text-base font-normal text-muted-foreground">
								({completed.length} completed)
							</span>
						</CardTitle>
						<CardDescription>
							All student papers you have uploaded and marked.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Student</TableHead>
									<TableHead>Exam paper</TableHead>
									<TableHead>Score</TableHead>
									<TableHead>Submitted</TableHead>
									<TableHead></TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{submissions.map((sub) => (
									<SubmissionRow key={sub.id} sub={sub} />
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
