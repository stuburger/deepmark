import { listLlmCallSites } from "@/lib/admin/llm-queries"
import { LlmSettingsShell } from "./llm-settings-shell"

export default async function AdminSettingsPage() {
	const result = await listLlmCallSites()
	const initialCallSites = result?.data?.callSites ?? []

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Settings</h1>
				<p className="text-muted-foreground mt-1">
					Configure LLM models for each call site in the pipeline.
				</p>
			</div>
			<LlmSettingsShell initialCallSites={initialCallSites} />
		</div>
	)
}
