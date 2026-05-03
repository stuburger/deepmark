import { randomUUID } from "node:crypto"
import { db } from "@mcp-gcse/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// `auth()` is stubbed so we can switch the calling user mid-test. The active
// userId is held in a module-level variable that helper `actAs(...)` mutates.
let currentUser: { userId: string; email: string | null } | null = null

vi.mock("@/lib/auth", () => ({
	auth: async () => currentUser,
}))

function actAs(user: { userId: string; email: string | null } | null) {
	currentUser = user
}

// Same-package imports — must come after vi.mock above. The action clients
// resolve `auth()` lazily on each call, so each mocked user flows through.
const { getExamPaperDetail } = await import(
	"../../src/lib/exam-paper/paper/queries"
)
const { updateQuestion } = await import(
	"../../src/lib/exam-paper/questions/mutations"
)
const {
	listResourceGrants,
	revokeResourceGrant,
	shareResourceWithEmails,
	updateResourceGrantRole,
} = await import("../../src/lib/sharing/actions")
const { assertSubmissionAccess } = await import(
	"../../src/lib/authz/assertions"
)
const { loadAuthUser } = await import("../../src/lib/authz/effective-roles")

type TestUser = { id: string; email: string }

async function createUser(label: string): Promise<TestUser> {
	const id = randomUUID()
	const email = `${label}-${id}@example.com`
	await db.user.create({
		data: { id, email, name: label, role: "teacher", is_active: true },
	})
	return { id, email }
}

async function createPaperWithQuestion(ownerId: string): Promise<{
	paperId: string
	sectionId: string
	questionId: string
	submissionId: string
}> {
	const paperId = randomUUID()
	const sectionId = randomUUID()
	const questionId = randomUUID()
	const submissionId = randomUUID()

	await db.examPaper.create({
		data: {
			id: paperId,
			title: "Sharing Test Paper",
			subject: "biology",
			exam_board: "AQA",
			year: 2024,
			total_marks: 10,
			duration_minutes: 30,
			created_by_id: ownerId,
		},
	})
	await db.examSection.create({
		data: {
			id: sectionId,
			exam_paper_id: paperId,
			title: "Section A",
			total_marks: 10,
			order: 1,
			created_by_id: ownerId,
		},
	})
	await db.question.create({
		data: {
			id: questionId,
			text: "What is photosynthesis?",
			topic: "biology",
			subject: "biology",
			points: 3,
			question_type: "written",
			created_by_id: ownerId,
		},
	})
	await db.examSectionQuestion.create({
		data: { exam_section_id: sectionId, question_id: questionId, order: 1 },
	})
	await db.studentSubmission.create({
		data: {
			id: submissionId,
			exam_paper_id: paperId,
			uploaded_by: ownerId,
			s3_key: `test/sharing/${submissionId}.pdf`,
			s3_bucket: "test-bucket",
			exam_board: "AQA",
			pages: [],
		},
	})

	return { paperId, sectionId, questionId, submissionId }
}

async function cleanupPaper(paperId: string): Promise<void> {
	await db.studentSubmission.deleteMany({ where: { exam_paper_id: paperId } })
	await db.resourceGrant.deleteMany({
		where: { resource_id: paperId, resource_type: "exam_paper" },
	})
	const sections = await db.examSection.findMany({
		where: { exam_paper_id: paperId },
		select: { id: true },
	})
	const sectionIds = sections.map((s) => s.id)
	const links = await db.examSectionQuestion.findMany({
		where: { exam_section_id: { in: sectionIds } },
		select: { question_id: true },
	})
	const questionIds = links.map((l) => l.question_id)
	await db.examSectionQuestion.deleteMany({
		where: { exam_section_id: { in: sectionIds } },
	})
	await db.question.deleteMany({ where: { id: { in: questionIds } } })
	await db.examSection.deleteMany({ where: { exam_paper_id: paperId } })
	await db.examPaper.deleteMany({ where: { id: paperId } })
}

describe("exam paper sharing — end to end", () => {
	let owner: TestUser
	let sharee: TestUser
	let stranger: TestUser
	let third: TestUser
	let paperId: string
	let questionId: string
	let submissionId: string

	beforeEach(async () => {
		owner = await createUser("owner")
		sharee = await createUser("sharee")
		stranger = await createUser("stranger")
		third = await createUser("third")
		const ids = await createPaperWithQuestion(owner.id)
		paperId = ids.paperId
		questionId = ids.questionId
		submissionId = ids.submissionId
	})

	afterEach(async () => {
		actAs(null)
		await cleanupPaper(paperId)
		await db.user.deleteMany({
			where: { id: { in: [owner.id, sharee.id, stranger.id, third.id] } },
		})
	})

	it("blocks non-owners from reading or editing the paper", async () => {
		actAs({ userId: sharee.id, email: sharee.email })

		const detail = await getExamPaperDetail({ id: paperId })
		expect(detail?.serverError).toBeTruthy()

		const update = await updateQuestion({
			questionId,
			input: { points: 7 },
		})
		expect(update?.serverError).toBeTruthy()

		const row = await db.question.findUniqueOrThrow({
			where: { id: questionId },
		})
		expect(row.points).toBe(3)
	})

	it("viewer can read but not edit", async () => {
		actAs({ userId: owner.id, email: owner.email })
		const share = await shareResourceWithEmails({
			resourceType: "exam_paper",
			resourceId: paperId,
			emails: [sharee.email],
			role: "viewer",
		})
		expect(share?.data?.grantIds).toHaveLength(1)

		actAs({ userId: sharee.id, email: sharee.email })
		const detail = await getExamPaperDetail({ id: paperId })
		expect(detail?.data?.paper?.id).toBe(paperId)

		const update = await updateQuestion({
			questionId,
			input: { points: 9 },
		})
		expect(update?.serverError).toBeTruthy()
	})

	it("editor can edit questions and child submissions cascade", async () => {
		actAs({ userId: owner.id, email: owner.email })
		await shareResourceWithEmails({
			resourceType: "exam_paper",
			resourceId: paperId,
			emails: [sharee.email],
			role: "editor",
		})

		actAs({ userId: sharee.id, email: sharee.email })

		const update = await updateQuestion({
			questionId,
			input: { points: 8 },
		})
		expect(update?.serverError).toBeFalsy()
		const row = await db.question.findUniqueOrThrow({
			where: { id: questionId },
		})
		expect(row.points).toBe(8)

		// Cascade: paper editor → submission editor (no direct submission grant).
		const shareeUser = await loadAuthUser(sharee.id)
		expect(shareeUser).not.toBeNull()
		if (!shareeUser) return
		const subAccess = await assertSubmissionAccess(
			shareeUser,
			submissionId,
			"editor",
		)
		expect(subAccess.ok).toBe(true)

		// Editor cannot share onward — that's owner-only.
		const onwardShare = await shareResourceWithEmails({
			resourceType: "exam_paper",
			resourceId: paperId,
			emails: [stranger.email],
			role: "viewer",
		})
		expect(onwardShare?.serverError).toBeTruthy()
	})

	it("owner-grantees can share onward; final-owner-grant cannot be downgraded or revoked", async () => {
		// Note: the guard counts *grant rows* with role=owner. The legacy
		// paper.created_by_id grants effective owner status but doesn't appear in
		// that count, so the first owner grant is the "final owner grant".
		actAs({ userId: owner.id, email: owner.email })
		const share = await shareResourceWithEmails({
			resourceType: "exam_paper",
			resourceId: paperId,
			emails: [sharee.email],
			role: "owner",
		})
		const ownerGrantId = share?.data?.grantIds[0]
		expect(ownerGrantId).toBeDefined()
		if (!ownerGrantId) return

		// Sharee (now grant-owner) can invite a third user.
		actAs({ userId: sharee.id, email: sharee.email })
		const onward = await shareResourceWithEmails({
			resourceType: "exam_paper",
			resourceId: paperId,
			emails: [third.email],
			role: "viewer",
		})
		expect(onward?.data?.grantIds).toHaveLength(1)

		// Final-owner-grant guard — downgrade is blocked. The plain Error is
		// mapped to the generic serverError string, so we assert via persisted
		// state instead of the wording.
		actAs({ userId: owner.id, email: owner.email })
		const downgrade = await updateResourceGrantRole({
			grantId: ownerGrantId,
			role: "viewer",
		})
		expect(downgrade?.serverError).toBeTruthy()
		const afterDowngrade = await db.resourceGrant.findUniqueOrThrow({
			where: { id: ownerGrantId },
		})
		expect(afterDowngrade.role).toBe("owner")

		// Revoke is also blocked.
		const revoke = await revokeResourceGrant({ grantId: ownerGrantId })
		expect(revoke?.serverError).toBeTruthy()
		const afterRevoke = await db.resourceGrant.findUniqueOrThrow({
			where: { id: ownerGrantId },
		})
		expect(afterRevoke.revoked_at).toBeNull()

		// Add a second owner grant — now the original is no longer the last one.
		const second = await shareResourceWithEmails({
			resourceType: "exam_paper",
			resourceId: paperId,
			emails: [third.email],
			role: "owner",
		})
		expect(second?.data?.grantIds).toHaveLength(1)

		// Now downgrading the original owner grant succeeds (active count = 2).
		const downgradeAgain = await updateResourceGrantRole({
			grantId: ownerGrantId,
			role: "viewer",
		})
		expect(downgradeAgain?.serverError).toBeFalsy()
	})

	it("revoke removes all access", async () => {
		actAs({ userId: owner.id, email: owner.email })
		const share = await shareResourceWithEmails({
			resourceType: "exam_paper",
			resourceId: paperId,
			emails: [sharee.email],
			role: "editor",
		})
		const grantId = share?.data?.grantIds[0]
		expect(grantId).toBeDefined()
		if (!grantId) return

		// Sharee has access pre-revoke.
		actAs({ userId: sharee.id, email: sharee.email })
		const before = await getExamPaperDetail({ id: paperId })
		expect(before?.data?.paper?.id).toBe(paperId)

		// Owner revokes.
		actAs({ userId: owner.id, email: owner.email })
		const revoke = await revokeResourceGrant({ grantId })
		expect(revoke?.serverError).toBeFalsy()

		// Access gone.
		actAs({ userId: sharee.id, email: sharee.email })
		const after = await getExamPaperDetail({ id: paperId })
		expect(after?.serverError).toBeTruthy()
	})

	it("listResourceGrants is viewer-readable; non-grantees cannot list", async () => {
		actAs({ userId: owner.id, email: owner.email })
		await shareResourceWithEmails({
			resourceType: "exam_paper",
			resourceId: paperId,
			emails: [sharee.email],
			role: "viewer",
		})

		// Viewer can list.
		actAs({ userId: sharee.id, email: sharee.email })
		const asViewer = await listResourceGrants({
			resourceType: "exam_paper",
			resourceId: paperId,
		})
		expect(asViewer?.data?.grants.length).toBeGreaterThan(0)

		// Stranger (no grant) cannot.
		actAs({ userId: stranger.id, email: stranger.email })
		const asStranger = await listResourceGrants({
			resourceType: "exam_paper",
			resourceId: paperId,
		})
		expect(asStranger?.serverError).toBeTruthy()
	})

	it("pending email invite resolves on signup-time match (already-signed-up case)", async () => {
		// Sharee already exists; the invite should attach principal_user_id
		// immediately rather than leave a pending row.
		actAs({ userId: owner.id, email: owner.email })
		const share = await shareResourceWithEmails({
			resourceType: "exam_paper",
			resourceId: paperId,
			emails: [sharee.email.toUpperCase()], // mixed case → normalised
			role: "viewer",
		})
		const grantId = share?.data?.grantIds[0]
		expect(grantId).toBeDefined()
		if (!grantId) return

		const grant = await db.resourceGrant.findUniqueOrThrow({
			where: { id: grantId },
		})
		expect(grant.principal_user_id).toBe(sharee.id)
		expect(grant.principal_email).toBe(sharee.email.toLowerCase())
		expect(grant.accepted_at).not.toBeNull()
	})
})
