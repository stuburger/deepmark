import { buttonVariants } from "@/components/ui/button-variants"
import type { StudentPaperJobPayload } from "@/lib/mark-actions"
import { AlertCircle } from "lucide-react"
import Link from "next/link"

export function FailedPanel({
	data,
}: {
	data: StudentPaperJobPayload
	jobId: string
}) {
	return (
		<div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-5 space-y-4">
			<div className="flex items-start gap-3">
				<div className="rounded-full bg-destructive/10 p-2 shrink-0">
					<AlertCircle className="h-5 w-5 text-destructive" />
				</div>
				<div>
					<p className="font-semibold text-destructive">Processing failed</p>
					<p className="text-sm text-destructive/80 mt-1">
						{data.error ?? "An unknown error occurred."}
					</p>
				</div>
			</div>
			<Link
				href="/teacher/exam-papers"
				className={buttonVariants({ className: "w-full justify-center" })}
			>
				Start over — mark a new paper
			</Link>
		</div>
	)
}
