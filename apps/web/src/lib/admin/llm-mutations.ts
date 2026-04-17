"use server"

import { db } from "@/lib/db"
import { auth } from "../auth"
import type { LlmCallSiteRow, LlmModelEntry } from "./llm-types"
import { LLM_CALL_SITE_DEFAULTS } from "./llm-types"

// ─── Update model chain ──────────────────────────────────────────────────────

export type UpdateLlmCallSiteModelsResult =
	| { ok: true; callSite: LlmCallSiteRow }
	| { ok: false; error: string }

export async function updateLlmCallSiteModels(
	id: string,
	models: LlmModelEntry[],
): Promise<UpdateLlmCallSiteModelsResult> {
	try {
		const session = await auth()
		if (!session) return { ok: false, error: "Not authenticated" }

		if (models.length === 0) {
			return { ok: false, error: "At least one model is required" }
		}

		for (const m of models) {
			if (!m.provider || !m.model) {
				return {
					ok: false,
					error: "Each model entry requires a provider and model",
				}
			}
			if (
				typeof m.temperature !== "number" ||
				m.temperature < 0 ||
				m.temperature > 2
			) {
				return { ok: false, error: "Temperature must be between 0 and 2" }
			}
		}

		// Validate provider compatibility with input type
		const existing = await db.llmCallSite.findUnique({ where: { id } })
		if (!existing) return { ok: false, error: "Call site not found" }

		if (existing.input_type === "pdf") {
			const unsupported = models.filter((m) => m.provider === "openai")
			if (unsupported.length > 0) {
				return {
					ok: false,
					error:
						"OpenAI does not support PDF file inputs. Use Google or Anthropic for PDF call sites.",
				}
			}
		}

		const row = await db.llmCallSite.update({
			where: { id },
			data: {
				models: models as unknown as Parameters<
					typeof db.llmCallSite.create
				>[0]["data"]["models"],
				updated_by: session.userId,
			},
		})

		return {
			ok: true,
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
	} catch {
		return { ok: false, error: "Failed to update model configuration" }
	}
}

// ─── Bulk update all call sites ──────────────────────────────────────────────

export type BulkUpdateResult =
	| { ok: true; updated: number; skipped: number }
	| { ok: false; error: string }

export async function bulkUpdateLlmCallSiteModels(
	models: LlmModelEntry[],
): Promise<BulkUpdateResult> {
	try {
		const session = await auth()
		if (!session) return { ok: false, error: "Not authenticated" }

		if (models.length === 0) {
			return { ok: false, error: "At least one model is required" }
		}

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
			data: { models: modelsJson, updated_by: session.userId },
		})

		return { ok: true, updated: toUpdate.length, skipped }
	} catch {
		return { ok: false, error: "Failed to bulk update model configurations" }
	}
}

// ─── Seed / sync defaults ────────────────────────────────────────────────────

export type SeedLlmCallSitesResult =
	| { ok: true; created: number; updated: number; deleted: number }
	| { ok: false; error: string }

export async function seedLlmCallSites(): Promise<SeedLlmCallSitesResult> {
	try {
		const session = await auth()
		if (!session) return { ok: false, error: "Not authenticated" }

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
				updated_by: session.userId,
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

		return { ok: true, created, updated, deleted }
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		return { ok: false, error: `Failed to seed call sites: ${msg}` }
	}
}

// ─── Reset to defaults ───────────────────────────────────────────────────────

export type ResetLlmCallSiteResult =
	| { ok: true; callSite: LlmCallSiteRow }
	| { ok: false; error: string }

export async function resetLlmCallSiteToDefault(
	id: string,
): Promise<ResetLlmCallSiteResult> {
	try {
		const session = await auth()
		if (!session) return { ok: false, error: "Not authenticated" }

		const existing = await db.llmCallSite.findUnique({ where: { id } })
		if (!existing) return { ok: false, error: "Call site not found" }

		const def = LLM_CALL_SITE_DEFAULTS.find((d) => d.key === existing.key)
		if (!def)
			return {
				ok: false,
				error: "No default configuration found for this call site",
			}

		const row = await db.llmCallSite.update({
			where: { id },
			data: {
				models: def.models as unknown as Parameters<
					typeof db.llmCallSite.create
				>[0]["data"]["models"],
				updated_by: session.userId,
			},
		})

		return {
			ok: true,
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
	} catch {
		return { ok: false, error: "Failed to reset to defaults" }
	}
}
