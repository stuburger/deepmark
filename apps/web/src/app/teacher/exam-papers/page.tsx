import { buttonVariants } from "@/components/ui/button-variants"
import { Skeleton } from "@/components/ui/skeleton"
import { listExamPapers } from "@/lib/exam-paper/paper/queries"
import { PlusCircle } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"
import { ExamPaperCard } from "./exam-paper-card"

async function ExamPaperGrid() {
	const result = await listExamPapers()

	if (!result.ok) {
		return <p className="text-sm text-destructive">{result.error}</p>
	}

	if (result.papers.length === 0) {
		return (
			<p className="text-sm text-muted-foreground py-16 text-center">
				No exam papers yet.{" "}
				<Link
					href="/teacher/exam-papers/new"
					className="underline underline-offset-4"
				>
					Create your first one.
				</Link>
			</p>
		)
	}

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
			{result.papers.map((paper) => (
				<ExamPaperCard key={paper.id} paper={paper} />
			))}
		</div>
	)
}

function ExamPaperGridSkeleton() {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
			{Array.from({ length: 8 }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
				<div
					key={i}
					className="flex flex-col rounded-xl ring-1 ring-foreground/10 overflow-hidden"
				>
					<Skeleton className="h-1.5 rounded-none rounded-t-xl" />
					<div className="p-4 flex flex-col gap-3 flex-1">
						<div className="flex items-start justify-between gap-2">
							<Skeleton className="h-5 w-20 rounded-full" />
							<Skeleton className="h-5 w-14 rounded-full" />
						</div>
						<div className="space-y-1.5 mt-1">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-3/4" />
						</div>
						<Skeleton className="h-3 w-28 mt-0.5" />
					</div>
					<div className="px-4 pt-3 pb-4 border-t border-dashed space-y-1.5">
						<Skeleton className="h-3 w-32" />
						<Skeleton className="h-3 w-20" />
					</div>
					<div className="flex items-center justify-between px-4 py-3 border-t bg-muted/50">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-4 w-4 rounded" />
					</div>
				</div>
			))}
		</div>
	)
}

export default function ExamPapersPage() {
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

			<Suspense fallback={<ExamPaperGridSkeleton />}>
				<ExamPaperGrid />
			</Suspense>
		</div>
	)
}
