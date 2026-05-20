import { buttonVariants } from "@/components/ui/button-variants"
import { Card, CardContent } from "@/components/ui/card"
import { listMySubmissions } from "@/lib/marking/listing/queries"
import { PlusCircle } from "lucide-react"
import Link from "next/link"
import { MarkList } from "./mark-list"

export default async function MarkPage() {
	const result = await listMySubmissions()
	const submissions = result?.data?.submissions ?? []
	const completed = submissions.filter((s) => s.status === "ocr_complete")

	return (
		<div className="space-y-6 pt-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">
						Marking history
						<span className="ml-2 text-base font-normal text-muted-foreground">
							({completed.length} completed)
						</span>
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						All student papers you&apos;ve uploaded and marked.
					</p>
				</div>
				<Link
					href="/teacher/exam-papers"
					className={buttonVariants({ size: "lg" })}
				>
					<PlusCircle className="mr-2 h-4 w-4" />
					Browse exam papers
				</Link>
			</div>

			{submissions.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center space-y-4 py-16 text-center">
						<div className="rounded-full bg-muted p-4">
							<PlusCircle className="h-8 w-8 text-muted-foreground" />
						</div>
						<div>
							<h2 className="text-lg font-semibold">No papers marked yet</h2>
							<p className="mt-1 max-w-sm text-sm text-muted-foreground">
								Select an exam paper and upload a student&apos;s answer sheet.
							</p>
						</div>
						<Link
							href="/teacher/exam-papers"
							className={buttonVariants({ size: "lg" })}
						>
							<PlusCircle className="mr-2 h-4 w-4" />
							Browse exam papers
						</Link>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardContent className="pt-6">
						<MarkList initialSubmissions={submissions} />
					</CardContent>
				</Card>
			)}
		</div>
	)
}
