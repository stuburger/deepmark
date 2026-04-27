"use client"

import { useTeacherOverrideMutations } from "@/lib/marking/overrides/hooks"
import { type ReactNode, useMemo } from "react"
import { type DocOps, DocOpsContext } from "./doc-ops-context"

/**
 * Wires the React Query mutation hooks into the `DocOpsContext`. Lives in a
 * separate file from the context so NodeView consumers (which only need
 * `useDocOps`) don't transitively pull in the `"use server"` mutations
 * module — which is fine in Next.js but trips Vitest's resolver because
 * `server-only` is a deliberate tripwire.
 *
 * Mount once at submission-view level; both desktop + mobile editors share.
 */
export function DocOpsProvider({
	submissionId,
	children,
}: {
	submissionId: string
	children: ReactNode
}) {
	const { upsertOverride, deleteOverride, saveFeedbackBullets } =
		useTeacherOverrideMutations(submissionId)

	const ops = useMemo<DocOps>(
		() => ({
			saveOverride: (questionId, input) => {
				if (input === null) deleteOverride(questionId)
				else upsertOverride({ questionId, input })
			},
			saveFeedbackBullets: (questionId, patch) =>
				saveFeedbackBullets({ questionId, patch }),
		}),
		[upsertOverride, deleteOverride, saveFeedbackBullets],
	)

	return <DocOpsContext.Provider value={ops}>{children}</DocOpsContext.Provider>
}
