import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
/**
 * One-off backfill: create owner ResourceGrant rows from legacy columns.
 *
 * Run after `bun db:push` (or migrate) so `resource_grants` exists:
 *   DATABASE_URL=... bun run scripts/backfill-resource-grants.ts
 */
import { config } from "dotenv"
import { createPrismaClient } from "../src/client"
import {
	ResourceGrantPrincipalType,
	ResourceGrantResourceType,
	ResourceGrantRole,
} from "../src/generated/prisma/client"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
config({ path: resolve(__dirname, "../../../.env") })

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
	console.error("DATABASE_URL is required")
	process.exit(1)
}

const db = createPrismaClient(dbUrl)

async function main() {
	let papers = 0
	let subs = 0

	const examPapers = await db.examPaper.findMany({
		select: { id: true, created_by_id: true },
	})
	for (const p of examPapers) {
		const existing = await db.resourceGrant.findFirst({
			where: {
				resource_type: ResourceGrantResourceType.exam_paper,
				resource_id: p.id,
				principal_user_id: p.created_by_id,
				role: ResourceGrantRole.owner,
				revoked_at: null,
			},
		})
		if (existing) continue
		await db.resourceGrant.create({
			data: {
				resource_type: ResourceGrantResourceType.exam_paper,
				resource_id: p.id,
				principal_type: ResourceGrantPrincipalType.user,
				principal_user_id: p.created_by_id,
				role: ResourceGrantRole.owner,
				created_by: p.created_by_id,
				accepted_at: new Date(),
			},
		})
		papers++
	}

	const submissions = await db.studentSubmission.findMany({
		select: { id: true, uploaded_by: true },
	})
	for (const s of submissions) {
		const existing = await db.resourceGrant.findFirst({
			where: {
				resource_type: ResourceGrantResourceType.student_submission,
				resource_id: s.id,
				principal_user_id: s.uploaded_by,
				role: ResourceGrantRole.owner,
				revoked_at: null,
			},
		})
		if (existing) continue
		await db.resourceGrant.create({
			data: {
				resource_type: ResourceGrantResourceType.student_submission,
				resource_id: s.id,
				principal_type: ResourceGrantPrincipalType.user,
				principal_user_id: s.uploaded_by,
				role: ResourceGrantRole.owner,
				created_by: s.uploaded_by,
				accepted_at: new Date(),
			},
		})
		subs++
	}

	console.log(
		`Backfill complete: created ${papers} exam_paper owner grants, ${subs} student_submission owner grants.`,
	)
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => db.$disconnect())
