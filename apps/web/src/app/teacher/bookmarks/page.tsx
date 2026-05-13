import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { listBookmarkedSubmissions } from "@/lib/marking/listing/queries"
import { Bookmark } from "lucide-react"
import { BookmarksView } from "./bookmarks-view"

export default async function BookmarksPage() {
	const result = await listBookmarkedSubmissions()
	const submissions = result?.data?.submissions ?? []

	return (
		<div className="space-y-6 pt-6">
			<div>
				<h1 className="text-2xl font-semibold">Bookmarked papers</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Submissions you&apos;ve bookmarked for quick access.
				</p>
			</div>

			{submissions.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center space-y-4 py-16 text-center">
						<div className="rounded-full bg-muted p-4">
							<Bookmark className="h-8 w-8 text-muted-foreground" />
						</div>
						<div>
							<h2 className="text-lg font-semibold">No bookmarks yet</h2>
							<p className="mt-1 max-w-sm text-sm text-muted-foreground">
								Bookmark a submission from any paper to pin it here for quick
								access.
							</p>
						</div>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>
							Bookmarks
							<span className="ml-2 text-base font-normal text-muted-foreground">
								({submissions.length})
							</span>
						</CardTitle>
						<CardDescription>
							Filter by status to narrow down what you&apos;re looking for.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<BookmarksView initialSubmissions={submissions} />
					</CardContent>
				</Card>
			)}
		</div>
	)
}
