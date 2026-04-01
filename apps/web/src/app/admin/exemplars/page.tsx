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
import {
	type ExemplarAnswerListItem,
	type ExemplarValidationStats,
	listExemplarAnswers,
} from "@/lib/admin/queries"
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

function truncate(s: string, max = 50) {
	return s.length > max ? `${s.slice(0, max)}…` : s
}

function formatDate(date: Date) {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(new Date(date))
}

function levelVariant(level: number): BadgeVariant {
	if (level >= 3) return "default"
	if (level === 2) return "secondary"
	return "outline"
}

function accuracyVariant(pct: number): BadgeVariant {
	if (pct >= 80) return "default"
	if (pct >= 50) return "secondary"
	return "destructive"
}

function ValidationBadge({
	validation,
}: {
	validation: ExemplarValidationStats | null
}) {
	if (!validation)
		return <span className="text-muted-foreground text-xs">—</span>
	return (
		<Badge
			variant={accuracyVariant(validation.accuracyPercent)}
			className="tabular-nums whitespace-nowrap"
		>
			{validation.accuracyPercent}% — {validation.passed}/{validation.total}
		</Badge>
	)
}

function ExemplarRow({ exemplar }: { exemplar: ExemplarAnswerListItem }) {
	const questionText = exemplar.question?.text ?? exemplar.raw_question_text
	const subject = exemplar.question?.subject

	return (
		<TableRow>
			<TableCell className="overflow-hidden" title={questionText}>
				<p className="truncate text-sm">{truncate(questionText)}</p>
				{exemplar.question_part && (
					<span className="text-xs text-muted-foreground">
						Part {exemplar.question_part.part_label}
					</span>
				)}
			</TableCell>
			<TableCell>
				{subject ? (
					<Badge variant={subjectVariant(subject)}>{capitalize(subject)}</Badge>
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</TableCell>
			<TableCell className="whitespace-nowrap">
				{exemplar.source_exam_board}
			</TableCell>
			<TableCell>
				<Badge variant={levelVariant(exemplar.level)}>L{exemplar.level}</Badge>
			</TableCell>
			<TableCell className="overflow-hidden" title={exemplar.answer_text}>
				<p className="truncate text-sm text-muted-foreground">
					{truncate(exemplar.answer_text)}
				</p>
			</TableCell>
			<TableCell className="text-center tabular-nums">
				{exemplar.word_count ?? "—"}
			</TableCell>
			<TableCell className="whitespace-nowrap">
				{exemplar.mark_band ?? "—"}
			</TableCell>
			<TableCell className="text-center tabular-nums">
				{exemplar.expected_score ?? "—"}
			</TableCell>
			<TableCell>
				{exemplar.is_fake_exemplar ? (
					<Badge variant="outline">Synthetic</Badge>
				) : (
					<Badge variant="secondary">Real</Badge>
				)}
			</TableCell>
			<TableCell>
				<ValidationBadge validation={exemplar.validation} />
			</TableCell>
			<TableCell>
				<Link
					href={`/admin/upload/${exemplar.pdf_ingestion_job_id}`}
					className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground whitespace-nowrap"
				>
					View job
				</Link>
			</TableCell>
			<TableCell className="text-muted-foreground whitespace-nowrap">
				{formatDate(exemplar.created_at)}
			</TableCell>
		</TableRow>
	)
}

export default async function ExemplarAnswersPage() {
	const result = await listExemplarAnswers()

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Exemplar Answers</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Real and synthetic exemplar answers extracted from PDF uploads.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>
						All exemplars
						{result.ok && (
							<span className="ml-2 text-base font-normal text-muted-foreground">
								({result.exemplars.length})
							</span>
						)}
					</CardTitle>
					<CardDescription>
						Exemplar answers linked to questions and mark schemes from ingested
						PDFs.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{!result.ok ? (
						<p className="text-sm text-destructive">{result.error}</p>
					) : result.exemplars.length === 0 ? (
						<p className="text-sm text-muted-foreground py-8 text-center">
							No exemplar answers yet. Upload an exemplar PDF to get started.
						</p>
					) : (
						<Table className="table-fixed">
							<TableHeader>
								<TableRow>
									<TableHead className="w-[22%]">Question</TableHead>
									<TableHead className="w-[8%]">Subject</TableHead>
									<TableHead className="w-[6%]">Board</TableHead>
									<TableHead className="w-[5%]">Lvl</TableHead>
									<TableHead className="w-[22%]">Answer</TableHead>
									<TableHead className="w-[5%] text-center">Words</TableHead>
									<TableHead className="w-[6%]">Band</TableHead>
									<TableHead className="w-[5%] text-center">Score</TableHead>
									<TableHead className="w-[8%]">Type</TableHead>
									<TableHead className="w-[10%]">Validation</TableHead>
									<TableHead className="w-[6%]">Source</TableHead>
									<TableHead className="w-[7%]">Created</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{result.exemplars.map((exemplar) => (
									<ExemplarRow key={exemplar.id} exemplar={exemplar} />
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
