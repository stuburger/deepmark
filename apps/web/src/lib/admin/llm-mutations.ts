"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import type { LlmCallSiteRow, LlmModelEntry } from "./llm-types"
import { LLM_CALL_SITE_DEFAULTS } from "./llm-types"

const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

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
				models: row.models as LlmModelEntry[],
				updated_by: row.updated_by,
				updated_at: row.updated_at,
			},
		}
	} catch {
		return { ok: false, error: "Failed to update model configuration" }
	}
}

// ─── Seed / sync defaults ────────────────────────────────────────────────────

export type SeedLlmCallSitesResult =
	| { ok: true; created: number; updated: number }
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

			if (!existing) {
				await db.llmCallSite.create({
					data: {
						key: def.key,
						display_name: def.display_name,
						description: def.description,
						input_type: def.input_type,
						models: def.models as unknown as Parameters<
							typeof db.llmCallSite.create
						>[0]["data"]["models"],
						updated_by: session.userId,
					},
				})
				created++
			} else {
				// Update display_name and description if they changed, but leave models untouched
				if (
					existing.display_name !== def.display_name ||
					existing.description !== def.description ||
					existing.input_type !== def.input_type
				) {
					await db.llmCallSite.update({
						where: { key: def.key },
						data: {
							display_name: def.display_name,
							description: def.description,
							input_type: def.input_type,
							updated_by: session.userId,
						},
					})
					updated++
				}
			}
		}

		return { ok: true, created, updated }
	} catch {
		return { ok: false, error: "Failed to seed call sites" }
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
				models: row.models as LlmModelEntry[],
				updated_by: row.updated_by,
				updated_at: row.updated_at,
			},
		}
	} catch {
		return { ok: false, error: "Failed to reset to defaults" }
	}
}
