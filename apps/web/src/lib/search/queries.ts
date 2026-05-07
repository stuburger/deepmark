"use server"

import {
	authenticatedAction,
	examPaperAccessWhere,
	submissionAccessWhere,
} from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"

export type PaletteResult =
	| {
			kind: "paper"
			id: string
			title: string
			subject: string
	  }
	| {
			kind: "submission"
			id: string
			student_name: string | null
			paper_id: string
			paper_title: string
	  }

export const searchEverything = authenticatedAction
	.schema(z.object({ q: z.string().trim().max(100) }))
	.action(
		async ({
			parsedInput: { q },
			ctx,
		}): Promise<{
			papers: PaletteResult[]
			submissions: PaletteResult[]
		}> => {
			if (q.length === 0) {
				return { papers: [], submissions: [] }
			}
			const [paperWhere, subWhere] = await Promise.all([
				examPaperAccessWhere(ctx.user, "viewer"),
				submissionAccessWhere(ctx.user, "viewer"),
			])
			const [papers, subs] = await Promise.all([
				db.examPaper.findMany({
					where: {
						...paperWhere,
						is_active: true,
						title: { contains: q, mode: "insensitive" },
					},
					orderBy: { updated_at: "desc" },
					take: 5,
					select: { id: true, title: true, subject: true },
				}),
				db.studentSubmission.findMany({
					where: {
						...subWhere,
						superseded_at: null,
						student_name: { contains: q, mode: "insensitive" },
					},
					orderBy: { created_at: "desc" },
					take: 10,
					select: {
						id: true,
						student_name: true,
						exam_paper_id: true,
						exam_paper: { select: { title: true } },
					},
				}),
			])
			return {
				papers: papers.map((p) => ({
					kind: "paper",
					id: p.id,
					title: p.title,
					subject: p.subject,
				})),
				submissions: subs
					.filter((s) => s.exam_paper)
					.map((s) => ({
						kind: "submission",
						id: s.id,
						student_name: s.student_name,
						paper_id: s.exam_paper_id,
						paper_title: s.exam_paper?.title ?? "",
					})),
			}
		},
	)
