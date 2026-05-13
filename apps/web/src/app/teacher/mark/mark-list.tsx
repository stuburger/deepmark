"use client"

import { SubmissionsListTable } from "@/components/marking/submissions-list-table"
import { listMySubmissions } from "@/lib/marking/listing/queries"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"

type Row = SubmissionHistoryItem & { version_count: number }

export function MarkList({
	initialSubmissions,
}: { initialSubmissions: Row[] }) {
	const router = useRouter()
	const { data: submissions = initialSubmissions } = useQuery({
		queryKey: queryKeys.mySubmissions(),
		queryFn: async () => {
			const r = await listMySubmissions()
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data?.submissions ?? []
		},
		initialData: initialSubmissions,
		staleTime: 30_000,
	})

	return (
		<SubmissionsListTable
			submissions={submissions}
			onView={(id) => router.push(`/teacher/submissions/${id}`)}
		/>
	)
}
