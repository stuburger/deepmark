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
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { listExamPapers } from "@/lib/dashboard-actions"
import { PlusCircle } from "lucide-react"
import Link from "next/link"
import { ExamPaperRow } from "./exam-paper-row"

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
				<Link href="/teacher/exam-papers/new" className={buttonVariants()}>
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
								href="/teacher/exam-papers/new"
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
									<TableHead className="text-center">Paper</TableHead>
									<TableHead className="text-center">Marks</TableHead>
									<TableHead className="text-center">Duration</TableHead>
									<TableHead>Visibility</TableHead>
									<TableHead>Created</TableHead>
									<TableHead className="w-8" />
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
