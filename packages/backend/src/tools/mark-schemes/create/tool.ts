import { CreateMarkSchemeSchema } from "./schema"

import { tool } from "@/tools/shared/tool-utils"
import { db } from "@/db"
import type { QuestionPart } from "@/generated/prisma"

export const handler = tool(CreateMarkSchemeSchema, async (args, extra) => {
	const {
		question_id,
		question_part_id,
		description,
		guidance,
		points_total,
		mark_points,
		marking_method = "point_based",
		marking_rules,
		tags = [],
	} = args

	console.log("[create-mark-scheme] Handler invoked", {
		question_id,
		question_part_id,
		points_total,
		marking_method,
		tags,
	})

	// Method-aware validation
	if (marking_method === "point_based") {
		const totalMarkPoints = mark_points.reduce(
			(sum, point) => sum + point.points,
			0,
		)
		if (totalMarkPoints !== points_total) {
			throw new Error(
				`Total points (${points_total}) does not match sum of mark points (${totalMarkPoints})`,
			)
		}
		if (mark_points.length !== points_total) {
			throw new Error(
				`Number of mark points (${mark_points.length}) does not match points total (${points_total})`,
			)
		}
		const invalidPoints = mark_points.filter((point) => point.points !== 1)
		if (invalidPoints.length > 0) {
			throw new Error(
				`All mark points must have a points value of 1 for point_based. Found ${invalidPoints.length} invalid mark points.`,
			)
		}
	} else if (marking_method === "level_of_response") {
		const maxMark = mark_points.reduce(
			(max, point) => Math.max(max, point.points),
			0,
		)
		if (points_total < maxMark) {
			throw new Error(
				`points_total (${points_total}) must be at least the maximum mark point value (${maxMark}) for level_of_response.`,
			)
		}
	}
	// deterministic: no mark_points validation

	// Validate that the question exists
	const question = await db.question.findUniqueOrThrow({
		where: { id: question_id },
	})

	// If question_part_id is provided, validate that the question part exists
	let questionPart: QuestionPart | null = null
	if (question_part_id) {
		questionPart = await db.questionPart.findFirstOrThrow({
			where: {
				id: question_part_id,
				question_id: question_id, // Ensure the part belongs to the question
			},
		})
	}

	// Insert the mark scheme into the database
	const result = await db.markScheme.create({
		data: {
			question_id,
			question_part_id: question_part_id || undefined,
			description,
			guidance,
			points_total,
			tags: tags || [],
			mark_points,
			marking_method: marking_method ?? "point_based",
			marking_rules: marking_rules ?? undefined,
			created_by_id: extra.authInfo.extra.userId, // TODO: Get from auth context when available
		},
	})

	console.log("[create-mark-scheme] Successfully created mark scheme", {
		mark_scheme_id: result.id,
		question_id,
		question_part_id,
		points_total,
	})

	// Get the text to display (question or question part)
	const questionText = questionPart ? questionPart.text : question.text
	const partInfo = questionPart ? ` (Part ${questionPart.part_label})` : ""

	const questionPreview =
		questionText.substring(0, 100) + (questionText.length > 100 ? "..." : "")

	const tagsInfo = tags && tags.length > 0 ? `\nTags: ${tags.join(", ")}` : ""

	return `Mark scheme created successfully! Mark Scheme ID: ${result.id}

Question${partInfo}: ${questionPreview}
Description: ${description}${tagsInfo}
Total Points: ${points_total}
Number of Mark Points: ${mark_points.length}`
})
