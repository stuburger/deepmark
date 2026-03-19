import { Badge } from "@/components/ui/badge"
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
import { type QuestionListItem, listQuestions } from "@/lib/dashboard-actions"

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

function originLabel(origin: string): string {
	switch (origin) {
		case "mark_scheme":
			return "Mark Scheme"
		case "question_paper":
			return "Question Paper"
		case "exemplar":
			return "Exemplar"
		case "manual":
			return "Manual"
		default:
			return origin
	}
}

function originVariant(origin: string): BadgeVariant {
	switch (origin) {
		case "mark_scheme":
			return "secondary"
		case "question_paper":
			return "default"
		case "exemplar":
			return "outline"
		default:
			return "outline"
	}
}

function difficultyVariant(level: string | null): BadgeVariant {
	switch (level) {
		case "easy":
			return "secondary"
		case "medium":
			return "outline"
		case "hard":
			return "default"
		case "expert":
			return "destructive"
		default:
			return "outline"
	}
}

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

function truncate(s: string, max = 80) {
	return s.length > max ? `${s.slice(0, max)}…` : s
}

function formatDate(date: Date) {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(new Date(date))
}

function QuestionRow({ q }: { q: QuestionListItem }) {
	return (
		<TableRow>
			<TableCell>
				<Badge variant={subjectVariant(q.subject)}>
					{capitalize(q.subject)}
				</Badge>
			</TableCell>
			<TableCell className="max-w-xs">
				<span className="text-sm" title={q.text}>
					{truncate(q.text)}
				</span>
			</TableCell>
			<TableCell className="text-muted-foreground text-sm">{q.topic}</TableCell>
			<TableCell>
				{q.difficulty_level ? (
					<Badge variant={difficultyVariant(q.difficulty_level)}>
						{capitalize(q.difficulty_level)}
					</Badge>
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</TableCell>
			<TableCell className="text-center">
				{q.points != null ? (
					q.points
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</TableCell>
			<TableCell className="text-center">{q._count.question_parts}</TableCell>
			<TableCell className="text-center">{q._count.mark_schemes}</TableCell>
			<TableCell className="text-center">{q._count.answers}</TableCell>
			<TableCell>
				<Badge variant={originVariant(q.origin)}>{originLabel(q.origin)}</Badge>
			</TableCell>
			<TableCell className="text-muted-foreground text-sm">
				{formatDate(q.created_at)}
			</TableCell>
		</TableRow>
	)
}

export default async function QuestionsPage() {
	const result = await listQuestions()

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Questions</h1>
				<p className="text-sm text-muted-foreground mt-1">
					All questions across subjects and exam papers.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>
						All questions
						{result.ok && (
							<span className="ml-2 text-base font-normal text-muted-foreground">
								({result.questions.length})
							</span>
						)}
					</CardTitle>
					<CardDescription>
						Questions sourced from mark scheme PDFs, question papers, and manual
						entry.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{!result.ok ? (
						<p className="text-sm text-destructive">{result.error}</p>
					) : result.questions.length === 0 ? (
						<p className="text-sm text-muted-foreground py-8 text-center">
							No questions yet.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Subject</TableHead>
									<TableHead>Question</TableHead>
									<TableHead>Topic</TableHead>
									<TableHead>Difficulty</TableHead>
									<TableHead className="text-center">Pts</TableHead>
									<TableHead className="text-center">Parts</TableHead>
									<TableHead className="text-center">Schemes</TableHead>
									<TableHead className="text-center">Answers</TableHead>
									<TableHead>Origin</TableHead>
									<TableHead>Created</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{result.questions.map((q) => (
									<QuestionRow key={q.id} q={q} />
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
