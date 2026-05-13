import Link from "next/link"
import { NewPaperUploadClient } from "./new-paper-upload-client"

export default function NewPaperPage() {
	return (
		<div className="mx-auto w-full max-w-3xl space-y-6 py-8">
			<div className="space-y-2">
				<p className="text-xs uppercase tracking-wide text-ink-tertiary">
					Step 1 · Upload
				</p>
				<h1 className="text-2xl font-semibold text-foreground">
					Drop in your paper
				</h1>
				<p className="text-sm text-muted-foreground">
					Drop the question paper, mark scheme, and student scripts together —
					we'll route each file into the right slot. Click Go when ready.
				</p>
			</div>
			<NewPaperUploadClient />
			<p className="text-xs text-muted-foreground">
				Already have an exam paper to add to?{" "}
				<Link
					href="/teacher/exam-papers"
					className="text-foreground underline underline-offset-2 hover:text-primary"
				>
					Open it from the dashboard
				</Link>
				.
			</p>
		</div>
	)
}
