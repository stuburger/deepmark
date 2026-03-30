import { buttonVariants } from "@/components/ui/button-variants"
import { XCircle } from "lucide-react"
import Link from "next/link"

/** Shown when the job has been cancelled. */
export function CancelledPanel() {
	return (
		<div className="rounded-xl border bg-muted/40 px-6 py-8 flex flex-col items-center text-center gap-4">
			<div className="rounded-full bg-muted p-3">
				<XCircle className="h-6 w-6 text-muted-foreground" />
			</div>
			<div>
				<p className="font-semibold">This job was cancelled</p>
				<p className="text-sm text-muted-foreground mt-1">
					No results were saved.
				</p>
			</div>
			<Link href="/teacher/exam-papers" className={buttonVariants()}>
				Browse exam papers
			</Link>
		</div>
	)
}
