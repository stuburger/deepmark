import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
	getExamPaperDetail,
	toggleExamPaperPublic,
} from "@/lib/dashboard-actions"
import { BookOpen, Clock, FileText, Globe, Lock, Upload } from "lucide-react"
import { revalidatePath } from "next/cache"
import Link from "next/link"
import { notFound } from "next/navigation"

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

function originBadgeVariant(origin: string) {
	switch (origin) {
		case "question_paper":
			return "default" as const
		case "mark_scheme":
			return "secondary" as const
		default:
			return "outline" as const
	}
}

function originLabel(origin: string) {
	switch (origin) {
		case "question_paper":
			return "Question Paper"
		case "mark_scheme":
			return "Mark Scheme"
		case "exemplar":
			return "Exemplar"
		case "manual":
			return "Manual"
		default:
			return origin
	}
}

function linkStatusBadge(status: string | null) {
	if (!status) return <Badge variant="outline">No scheme</Badge>
	switch (status) {
		case "linked":
			return <Badge variant="secondary">Linked</Badge>
		case "auto_linked":
			return (
				<Badge variant="outline" className="border-amber-300 text-amber-700">
					Auto-linked
				</Badge>
			)
		case "unlinked":
			return <Badge variant="destructive">Unlinked</Badge>
		default:
			return <Badge variant="outline">{status}</Badge>
	}
}

async function TogglePublicForm({
	id,
	isPublic,
}: { id: string; isPublic: boolean }) {
	async function toggle() {
		"use server"
		await toggleExamPaperPublic(id, !isPublic)
		revalidatePath(`/dashboard/exam-papers/${id}`)
	}
	return (
		<form action={toggle}>
			<Button type="submit" variant="outline" size="sm">
				{isPublic ? (
					<>
						<Lock className="h-3.5 w-3.5 mr-1.5" />
						Unpublish
					</>
				) : (
					<>
						<Globe className="h-3.5 w-3.5 mr-1.5" />
						Publish to catalog
					</>
				)}
			</Button>
		</form>
	)
}

export default async function ExamPaperDetailPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const result = await getExamPaperDetail(id)
	if (!result.ok) notFound()

	const { paper } = result
	const questionsWithScheme = paper.questions.filter(
		(q) => q.mark_scheme_count > 0,
	)
	const questionsWithoutScheme = paper.questions.filter(
		(q) => q.mark_scheme_count === 0,
	)

	return (
		<div className="space-y-6">
			<div>
				<Link
					href="/dashboard/exam-papers"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← Back to exam papers
				</Link>
				<div className="mt-2 flex items-start justify-between gap-4">
					<div>
						<h1 className="text-2xl font-semibold">{paper.title}</h1>
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
						<TogglePublicForm id={paper.id} isPublic={paper.is_public} />
						<Link
							href={`/dashboard/exam-papers/${paper.id}/upload`}
							className={buttonVariants({ size: "sm" })}
						>
							<Upload className="h-3.5 w-3.5 mr-1.5" />
							Upload PDF
						</Link>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-3 gap-4">
				<Card>
					<CardContent className="pt-4 flex items-center gap-3">
						<FileText className="h-5 w-5 text-muted-foreground" />
						<div>
							<p className="text-2xl font-bold">{paper.questions.length}</p>
							<p className="text-xs text-muted-foreground">Questions</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4 flex items-center gap-3">
						<BookOpen className="h-5 w-5 text-muted-foreground" />
						<div>
							<p className="text-2xl font-bold">{paper.total_marks}</p>
							<p className="text-xs text-muted-foreground">Total marks</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4 flex items-center gap-3">
						<Clock className="h-5 w-5 text-muted-foreground" />
						<div>
							<p className="text-2xl font-bold">{paper.duration_minutes}</p>
							<p className="text-xs text-muted-foreground">Minutes</p>
						</div>
					</CardContent>
				</Card>
			</div>

			<Tabs defaultValue="questions">
				<TabsList>
					<TabsTrigger value="questions">
						Questions ({paper.questions.length})
					</TabsTrigger>
					<TabsTrigger value="mark-schemes">
						Mark schemes ({questionsWithScheme.length}/{paper.questions.length})
					</TabsTrigger>
				</TabsList>

				<TabsContent value="questions" className="mt-4">
					<Card>
						<CardHeader>
							<CardTitle>Questions</CardTitle>
							<CardDescription>
								{paper.section_count} section
								{paper.section_count !== 1 ? "s" : ""} ·{" "}
								{paper.questions.length} question
								{paper.questions.length !== 1 ? "s" : ""}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{paper.questions.length === 0 ? (
								<div className="py-8 text-center text-sm text-muted-foreground">
									No questions yet.{" "}
									<Link
										href={`/dashboard/exam-papers/${paper.id}/upload`}
										className="underline underline-offset-4"
									>
										Upload a question paper or mark scheme PDF
									</Link>{" "}
									to populate this paper.
								</div>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-8">#</TableHead>
											<TableHead>Section</TableHead>
											<TableHead>Question</TableHead>
											<TableHead>Origin</TableHead>
											<TableHead className="text-center">Marks</TableHead>
											<TableHead>Mark scheme</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{paper.questions.map((q) => (
											<TableRow key={q.id}>
												<TableCell className="text-muted-foreground">
													{q.order}
												</TableCell>
												<TableCell className="text-muted-foreground text-xs">
													{q.section_title}
												</TableCell>
												<TableCell className="max-w-xs">
													<p className="truncate text-sm" title={q.text}>
														{q.text}
													</p>
												</TableCell>
												<TableCell>
													<Badge variant={originBadgeVariant(q.origin)}>
														{originLabel(q.origin)}
													</Badge>
												</TableCell>
												<TableCell className="text-center">
													{q.points ?? "—"}
												</TableCell>
												<TableCell>
													{linkStatusBadge(q.mark_scheme_status)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="mark-schemes" className="mt-4">
					<Card>
						<CardHeader>
							<CardTitle>Mark scheme coverage</CardTitle>
							<CardDescription>
								{questionsWithScheme.length} of {paper.questions.length}{" "}
								questions have a mark scheme.
								{questionsWithoutScheme.length > 0 && (
									<span className="ml-1 text-amber-600">
										{questionsWithoutScheme.length} missing.
									</span>
								)}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{paper.questions.length === 0 ? (
								<p className="py-6 text-center text-sm text-muted-foreground">
									No questions yet.
								</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>#</TableHead>
											<TableHead>Question</TableHead>
											<TableHead className="text-center">Marks</TableHead>
											<TableHead>Status</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{paper.questions.map((q) => (
											<TableRow key={q.id}>
												<TableCell className="text-muted-foreground">
													{q.order}
												</TableCell>
												<TableCell className="max-w-xs">
													<p className="truncate text-sm" title={q.text}>
														{q.text}
													</p>
												</TableCell>
												<TableCell className="text-center">
													{q.points ?? "—"}
												</TableCell>
												<TableCell>
													{linkStatusBadge(q.mark_scheme_status)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

			<Separator />

			<div className="text-sm text-muted-foreground">
				<Link
					href={`/dashboard/exam-papers/${paper.id}/upload`}
					className="underline underline-offset-4"
				>
					Upload a mark scheme, question paper, or exemplar PDF
				</Link>{" "}
				to populate questions and mark schemes.
			</div>
		</div>
	)
}
