import { getCurrency } from "@/lib/billing/currency"
import { formatPrice } from "@/lib/billing/plans"
import { getExamPaperDetail } from "@/lib/exam-paper/paper/queries"
import { listMySubmissions } from "@/lib/marking/listing/queries"
import { getExamPaperStats } from "@/lib/marking/stats/queries"
import { getExamPaperIngestionLiveState } from "@/lib/pdf-ingestion/queries"
import { notFound } from "next/navigation"
import { Resource } from "sst"
import { ExamPaperPageShell } from "./exam-paper-page-shell"

export default async function ExamPaperDetailPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const [result, liveStateResult, submissionsResult, statsResult, currency] =
		await Promise.all([
			getExamPaperDetail({ id }),
			getExamPaperIngestionLiveState({ examPaperId: id }),
			listMySubmissions(),
			getExamPaperStats({ examPaperId: id }),
			getCurrency(),
		])
	const paper = result?.data?.paper
	if (!paper) notFound()

	const liveData = liveStateResult?.data
	const initialLiveState = liveData
		? {
				ok: true as const,
				jobs: liveData.jobs,
				documents: liveData.documents,
			}
		: { ok: true as const, jobs: [], documents: [] }
	const initialSubmissions = submissionsResult?.data?.submissions
		? submissionsResult.data.submissions.filter((s) => s.exam_paper_id === id)
		: []
	const initialAnalytics = statsResult?.data?.stats ?? null

	// Cap-bite modal context — passed down so the modal can render the right
	// currency-aware top-up CTA without an extra round-trip when it opens.
	const topUpPriceLabel = formatPrice(
		Resource.StripeConfig.topUp[currency].amount,
		currency,
	)

	return (
		<div className="space-y-6">
			<ExamPaperPageShell
				paper={paper}
				initialLiveState={initialLiveState}
				initialSubmissions={initialSubmissions}
				initialAnalytics={initialAnalytics}
				currency={currency}
				topUpPriceLabel={topUpPriceLabel}
				topUpPapers={Resource.StripeConfig.topUp.papersPerPurchase}
			/>
		</div>
	)
}
