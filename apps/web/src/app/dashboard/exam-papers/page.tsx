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
import { type ExamPaperListItem, listExamPapers } from "@/lib/dashboard-actions"
import { Globe, Lock, PlusCircle } from "lucide-react"
import Link from "next/link"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

function subjectVariant(subject: string): BadgeVariant {
	switch (subject) {
		case "biology":
			return "secondary"
		case "chemistry":
			return "default"
		case "physics":
			return "outline"
		case "english":
			return "secondary"
		case "business":
			return "outline"
		default:
			return "outline"
	}
}

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDate(date: Date) {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(new Date(date))
}

function truncate(s: string, max = 60) {
	return s.length > max ? `${s.slice(0, max)}…` : s
}

function ExamPaperRow({ paper }: { paper: ExamPaperListItem }) {
	return (
		<TableRow className="cursor-pointer hover:bg-muted/50">
			<TableCell className="font-medium max-w-xs">
				<Link
					href={`/dashboard/exam-papers/${paper.id}`}
					className="hover:underline underline-offset-4"
					title={paper.title}
				>
					{truncate(paper.title)}
				</Link>
			</TableCell>
			<TableCell>
				<Badge variant={subjectVariant(paper.subject)}>
					{capitalize(paper.subject)}
				</Badge>
			</TableCell>
			<TableCell>{paper.exam_board ?? "—"}</TableCell>
			<TableCell>{paper.year}</TableCell>
			<TableCell className="text-center">{paper.paper_number ?? "—"}</TableCell>
			<TableCell className="text-center">{paper.total_marks}</TableCell>
			<TableCell className="text-center">
				{paper.duration_minutes} min
			</TableCell>
			<TableCell className="text-center">{paper._count.sections}</TableCell>
			<TableCell>
				{paper.is_public ? (
					<Badge variant="default" className="gap-1">
						<Globe className="h-3 w-3" /> Public
					</Badge>
				) : (
					<Badge variant="outline" className="gap-1 text-muted-foreground">
						<Lock className="h-3 w-3" /> Draft
					</Badge>
				)}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{formatDate(paper.created_at)}
			</TableCell>
		</TableRow>
	)
}

export default async function ExamPapersPage() {
	const result = await listExamPapers()

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Exam Papers</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage the exam paper catalog. Published papers appear in the
						teacher marking flow.
					</p>
				</div>
				<Link href="/dashboard/exam-papers/new" className={buttonVariants()}>
					<PlusCircle className="h-4 w-4 mr-2" />
					New exam paper
				</Link>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>
						All papers
						{result.ok && (
							<span className="ml-2 text-base font-normal text-muted-foreground">
								({result.papers.length})
							</span>
						)}
					</CardTitle>
					<CardDescription>
						Click a row to view questions, mark schemes, and upload PDFs.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{!result.ok ? (
						<p className="text-sm text-destructive">{result.error}</p>
					) : result.papers.length === 0 ? (
						<p className="text-sm text-muted-foreground py-8 text-center">
							No exam papers yet.{" "}
							<Link
								href="/dashboard/exam-papers/new"
								className="underline underline-offset-4"
							>
								Create your first one.
							</Link>
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Title</TableHead>
									<TableHead>Subject</TableHead>
									<TableHead>Board</TableHead>
									<TableHead>Year</TableHead>
									<TableHead className="text-center">Paper</TableHead>
									<TableHead className="text-center">Marks</TableHead>
									<TableHead className="text-center">Duration</TableHead>
									<TableHead className="text-center">Sections</TableHead>
									<TableHead>Visibility</TableHead>
									<TableHead>Created</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{result.papers.map((paper) => (
									<ExamPaperRow key={paper.id} paper={paper} />
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
