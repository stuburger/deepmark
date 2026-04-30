import type { ResourceGrantCandidate } from "./resource-policy"

/**
 * Repository contract for the data backing access decisions. Both the web app
 * (Next server actions) and the backend collab Lambda need to load ResourceGrant
 * rows for a given resource — the underlying query is identical, so we share
 * the interface here and let each side bind it to its own Prisma client.
 *
 * Keep this contract small: only the rows actually consumed by
 * `effective*Role` belong here. Side-specific extensions (loading the parent
 * exam_paper, etc.) stay on each side's local repository.
 */
export type ResourceGrantRepository = {
	loadResourceGrants(
		resourceType: "exam_paper" | "student_submission",
		resourceId: string,
	): Promise<ResourceGrantCandidate[]>
}
