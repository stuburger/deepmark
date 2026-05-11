import Link from "next/link"

import { Greeting } from "@/components/ui/greeting"
import { getDashboardData } from "@/lib/dashboard/queries"

import { AskAnythingPill } from "./ask-anything-pill"
import { DashboardActions } from "./dashboard-actions"
import { DashboardDateEyebrow } from "./dashboard-date-eyebrow"
import { RecentBatchesGrid } from "./recent-batches-grid"

export const dynamic = "force-dynamic"

export default async function TeacherDashboardPage() {
	const result = await getDashboardData()
	if (result?.serverError) throw new Error(result.serverError)
	const data = result?.data
	if (!data) throw new Error("Dashboard data unavailable")

	const { displayName, counts, recentPapers } = data

	return (
		<div className="mx-auto flex min-h-full w-full max-w-[1040px] flex-col px-2 py-8">
			{/* my-auto vertically centres this block when content fits the viewport
			    and collapses to 0 when it overflows, so the dashboard feels
			    anchored on tall monitors but still scrolls naturally on mobile. */}
			<div className="my-auto">
				{/* Hero row: greeting + stats on the left, action stack on the right */}
				<div className="mb-5 flex flex-col gap-10 md:flex-row md:items-start md:justify-between md:gap-10">
					<div className="flex flex-col">
						<DashboardDateEyebrow />
						<Greeting name={displayName} className="mb-3 mt-1.5" />
						<div className="flex flex-col gap-0.5">
							<DashboardStatLine
								count={counts.review}
								singular="script pending review"
								plural="scripts pending review"
							/>
							<DashboardStatLine
								count={counts.marking}
								singular="marking"
								plural="marking"
							/>
							<DashboardStatLine
								count={counts.done}
								singular="script marked"
								plural="scripts marked"
							/>
						</div>
					</div>

					<DashboardActions />
				</div>

				{/* Centred chat anchor */}
				<div className="mb-5 flex justify-center">
					<AskAnythingPill />
				</div>

				{/* Recent marking section */}
				{recentPapers.length > 0 && (
					<>
						<div className="mb-2.5 flex items-center justify-between">
							<span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-secondary">
								Recent marking
							</span>
							<Link
								href="/teacher/exam-papers"
								className="font-mono text-[9px] uppercase tracking-[0.05em] text-ink-tertiary hover:text-ink-secondary"
							>
								View all
							</Link>
						</div>
						<RecentBatchesGrid papers={recentPapers} />
					</>
				)}
			</div>
		</div>
	)
}

type DashboardStatLineProps = {
	count: number
	singular: string
	plural: string
}

function DashboardStatLine({
	count,
	singular,
	plural,
}: DashboardStatLineProps) {
	const label = count === 1 ? singular : plural
	return (
		<div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-foreground">
			<span>
				{count} {label}
			</span>
			<span className="text-ink-tertiary">·</span>
		</div>
	)
}
