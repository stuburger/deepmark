"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { BoundingBoxViewer } from "@/components/BoundingBoxViewer"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { pollScanStatus, type PageStatus } from "@/lib/scan-actions"

const POLL_INTERVAL_MS = 2000

export default function ScanResultPage() {
	const params = useParams()
	const id = typeof params.id === "string" ? params.id : ""
	const [allComplete, setAllComplete] = useState(false)
	const [pages, setPages] = useState<PageStatus[]>([])
	const [activePage, setActivePage] = useState(1)
	const [error, setError] = useState<string | null>(null)

	const poll = useCallback(async () => {
		if (!id) return
		const result = await pollScanStatus(id)
		if (!result.ok) {
			setError(result.error)
			return
		}
		setPages(result.pages)
		setAllComplete(result.allComplete)
	}, [id])

	useEffect(() => {
		if (!id) {
			setError("Missing scan ID")
			return
		}
		poll()
	}, [id, poll])

	useEffect(() => {
		if (!id || allComplete) return
		const t = setInterval(poll, POLL_INTERVAL_MS)
		return () => clearInterval(t)
	}, [id, allComplete, poll])

	if (error) {
		return (
			<main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-16">
				<Card>
					<CardHeader>
						<CardTitle>Error</CardTitle>
						<CardDescription>{error}</CardDescription>
					</CardHeader>
					<CardContent>
						<Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
							Back to dashboard
						</Link>
					</CardContent>
				</Card>
			</main>
		)
	}

	const anyFailed = pages.some((p) => p.ocrStatus === "failed")

	if (!allComplete) {
		const doneCount = pages.filter((p) => p.ocrStatus === "ocr_complete").length
		const totalCount = pages.length

		return (
			<main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-16">
				<Card>
					<CardHeader>
						<CardTitle>OCR in progress</CardTitle>
						<CardDescription>
							{anyFailed
								? "One or more pages failed to process."
								: totalCount > 1
									? `Processing pages… ${doneCount} of ${totalCount} complete.`
									: "Your handwritten page is being processed. This usually takes a few seconds."}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{!anyFailed && (
							<div className="flex items-center gap-2">
								<Skeleton className="size-5 rounded" />
								<span className="text-sm text-muted-foreground">Waiting for results…</span>
							</div>
						)}
						<Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
							Back to dashboard
						</Link>
					</CardContent>
				</Card>
			</main>
		)
	}

	const currentPage = pages.find((p) => p.pageNumber === activePage) ?? pages[0]

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-16">
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-semibold">Handwriting OCR result</h1>
				<Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
					Dashboard
				</Link>
			</div>

			{pages.length > 1 && (
				<div className="flex flex-wrap gap-2">
					{pages.map((p) => (
						<button
							key={p.pageNumber}
							onClick={() => setActivePage(p.pageNumber)}
							className={cn(
								"rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
								p.pageNumber === activePage
									? "bg-primary text-primary-foreground"
									: "bg-background text-foreground hover:bg-muted",
								p.ocrStatus === "failed" && "border-destructive text-destructive",
							)}
						>
							Page {p.pageNumber}
							{p.ocrStatus === "failed" ? " ✕" : ""}
						</button>
					))}
				</div>
			)}

			{currentPage?.ocrStatus === "failed" ? (
				<Card>
					<CardHeader>
						<CardTitle>Page {currentPage.pageNumber} failed</CardTitle>
						<CardDescription>
							OCR could not be completed for this page. Check the image quality and try again.
						</CardDescription>
					</CardHeader>
				</Card>
			) : currentPage?.ocrResult && currentPage.imageUrl ? (
				<BoundingBoxViewer imageUrl={currentPage.imageUrl} analysis={currentPage.ocrResult} />
			) : null}
		</main>
	)
}
