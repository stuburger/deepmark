"use server"

import { adminAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"
import type { LlmCallSiteRow, LlmModelEntry } from "./llm-types"
import { LLM_CALL_SITE_DEFAULTS } from "./llm-types"

const modelEntrySchema = z.object({
	provider: z.string().min(1),
	model: z.string().min(1),
	temperature: z.number().min(0).max(2),
})

// ─── Update model chain ──────────────────────────────────────────────────────

const updateInput = z.object({
	id: z.string(),
	models: z.array(modelEntrySchema).min(1, "At least one model is required"),
})

export const updateLlmCallSiteModels = adminAction
	.inputSchema(updateInput)
	.action(
		async ({
			parsedInput: { id, models },
			ctx,
		}): Promise<{ callSite: LlmCallSiteRow }> => {
			const existing = await db.llmCallSite.findUnique({ where: { id } })
			if (!existing) throw new Error("Call site not found")

			if (existing.input_type === "pdf") {
				const unsupported = models.filter((m) => m.provider === "openai")
				if (unsupported.length > 0) {
					throw new Error(
						"OpenAI does not support PDF file inputs. Use Google or Anthropic for PDF call sites.",
					)
				}
			}

			const row = await db.llmCallSite.update({
				where: { id },
				data: {
					models: models as unknown as Parameters<
						typeof db.llmCallSite.create
					>[0]["data"]["models"],
					updated_by: ctx.user.id,
				},
			})

			return {
				callSite: {
					id: row.id,
					key: row.key,
					display_name: row.display_name,
					description: row.description,
					input_type: row.input_type,
					phase: row.phase,
					models: row.models as LlmModelEntry[],
					updated_by: row.updated_by,
					updated_at: row.updated_at,
				},
			}
		},
	)

// ─── Bulk update all call sites ──────────────────────────────────────────────

const bulkUpdateInput = z.object({
	models: z.array(modelEntrySchema).min(1, "At least one model is required"),
})

export const bulkUpdateLlmCallSiteModels = adminAction
	.inputSchema(bulkUpdateInput)
	.action(
		async ({
			parsedInput: { models },
			ctx,
		}): Promise<{ updated: number; skipped: number }> => {
			const allCallSites = await db.llmCallSite.findMany({
				select: { id: true, input_type: true },
			})

			const hasOpenAi = models.some((m) => m.provider === "openai")
			const toUpdate = allCallSites.filter(
				(cs) => !(cs.input_type === "pdf" && hasOpenAi),
			)
			const skipped = allCallSites.length - toUpdate.length

			const modelsJson = models as unknown as Parameters<
				typeof db.llmCallSite.create
			>[0]["data"]["models"]

			await db.llmCallSite.updateMany({
				where: { id: { in: toUpdate.map((cs) => cs.id) } },
				data: { models: modelsJson, updated_by: ctx.user.id },
			})

			return { updated: toUpdate.length, skipped }
		},
	)

// ─── Seed / sync defaults ────────────────────────────────────────────────────

export const seedLlmCallSites = adminAction.action(
	async ({
		ctx,
	}): Promise<{ created: number; updated: number; deleted: number }> => {
		let created = 0
		let updated = 0

		for (const def of LLM_CALL_SITE_DEFAULTS) {
			const existing = await db.llmCallSite.findUnique({
				where: { key: def.key },
			})

			const data = {
				display_name: def.display_name,
				description: def.description,
				input_type: def.input_type,
				phase: def.phase,
				models: def.models as unknown as Parameters<
					typeof db.llmCallSite.create
				>[0]["data"]["models"],
				updated_by: ctx.user.id,
			}

			if (!existing) {
				await db.llmCallSite.create({
					data: { key: def.key, ...data },
				})
				created++
			} else {
				await db.llmCallSite.update({
					where: { key: def.key },
					data,
				})
				updated++
			}
		}

		// Delete orphaned rows whose key no longer exists in defaults
		const validKeys = new Set(LLM_CALL_SITE_DEFAULTS.map((d) => d.key))
		const { count: deleted } = await db.llmCallSite.deleteMany({
			where: { key: { notIn: [...validKeys] } },
		})

		return { created, updated, deleted }
	},
)

// ─── Reset to defaults ───────────────────────────────────────────────────────

const resetInput = z.object({ id: z.string() })

export const resetLlmCallSiteToDefault = adminAction
	.inputSchema(resetInput)
	.action(
		async ({
			parsedInput: { id },
			ctx,
		}): Promise<{ callSite: LlmCallSiteRow }> => {
			const existing = await db.llmCallSite.findUnique({ where: { id } })
			if (!existing) throw new Error("Call site not found")

			const def = LLM_CALL_SITE_DEFAULTS.find((d) => d.key === existing.key)
			if (!def) {
				throw new Error("No default configuration found for this call site")
			}

			const row = await db.llmCallSite.update({
				where: { id },
				data: {
					models: def.models as unknown as Parameters<
						typeof db.llmCallSite.create
					>[0]["data"]["models"],
					updated_by: ctx.user.id,
				},
			})

			return {
				callSite: {
					id: row.id,
					key: row.key,
					display_name: row.display_name,
					description: row.description,
					input_type: row.input_type,
					phase: row.phase,
					models: row.models as LlmModelEntry[],
					updated_by: row.updated_by,
					updated_at: row.updated_at,
				},
			}
		},
	)
