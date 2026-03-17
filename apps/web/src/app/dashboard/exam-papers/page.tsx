import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { listExamPapers, type ExamPaperListItem } from "@/lib/dashboard-actions"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

function subjectVariant(subject: string): BadgeVariant {
	switch (subject) {
		case "biology": return "secondary"
		case "chemistry": return "default"
		case "physics": return "outline"
		case "english": return "secondary"
		case "business": return "outline"
		default: return "outline"
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
		<TableRow>
			<TableCell className="font-medium max-w-xs" title={paper.title}>
				{truncate(paper.title)}
			</TableCell>
			<TableCell>
				<Badge variant={subjectVariant(paper.subject)}>{capitalize(paper.subject)}</Badge>
			</TableCell>
			<TableCell>{paper.exam_board ?? "—"}</TableCell>
			<TableCell>{paper.year}</TableCell>
			<TableCell className="text-center">{paper.paper_number ?? "—"}</TableCell>
			<TableCell className="text-center">{paper.total_marks}</TableCell>
			<TableCell className="text-center">{paper.duration_minutes} min</TableCell>
			<TableCell className="text-center">{paper._count.sections}</TableCell>
			<TableCell className="text-center">{paper._count.scan_submissions}</TableCell>
			<TableCell>
				<Badge variant={paper.is_active ? "secondary" : "outline"}>
					{paper.is_active ? "Active" : "Inactive"}
				</Badge>
			</TableCell>
			<TableCell className="text-muted-foreground">{formatDate(paper.created_at)}</TableCell>
		</TableRow>
	)
}

export default async function ExamPapersPage() {
	const result = await listExamPapers()

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Exam Papers</h1>
				<p className="text-sm text-muted-foreground mt-1">
					All exam papers created from mark scheme ingestion or manually.
				</p>
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
					<CardDescription>Exam papers grouped by subject and exam board.</CardDescription>
				</CardHeader>
				<CardContent>
					{!result.ok ? (
						<p className="text-sm text-destructive">{result.error}</p>
					) : result.papers.length === 0 ? (
						<p className="text-sm text-muted-foreground py-8 text-center">No exam papers yet.</p>
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
									<TableHead className="text-center">Submissions</TableHead>
									<TableHead>Status</TableHead>
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
