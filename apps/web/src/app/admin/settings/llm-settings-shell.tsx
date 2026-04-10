"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import {
	resetLlmCallSiteToDefault,
	seedLlmCallSites,
	updateLlmCallSiteModels,
} from "@/lib/admin/llm-mutations"
import { listLlmCallSites } from "@/lib/admin/llm-queries"
import type { LlmCallSiteRow, LlmModelEntry } from "@/lib/admin/llm-types"
import { queryKeys } from "@/lib/query-keys"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	Eye,
	FileText,
	ImageIcon,
	Loader2,
	Pencil,
	RefreshCw,
	RotateCcw,
	Type,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { EditModelsDialog } from "./edit-models-dialog"

const INPUT_TYPE_CONFIG: Record<
	string,
	{
		label: string
		icon: typeof Type
		variant: "default" | "secondary" | "outline"
	}
> = {
	text: { label: "Text", icon: Type, variant: "secondary" },
	vision: { label: "Vision", icon: ImageIcon, variant: "outline" },
	pdf: { label: "PDF", icon: FileText, variant: "default" },
}

function ModelChainBadges({ models }: { models: LlmModelEntry[] }) {
	return (
		<TooltipProvider delay={200}>
			<div className="flex items-center gap-1 flex-wrap">
				{models.map((m, i) => (
					<Tooltip key={`${m.provider}-${m.model}-${i}`}>
						<TooltipTrigger
							className="cursor-default"
							render={
								<Badge
									variant={i === 0 ? "default" : "outline"}
									className="text-xs font-mono"
								>
									{i > 0 && (
										<span className="text-muted-foreground mr-1">→</span>
									)}
									{m.model}
								</Badge>
							}
						/>
						<TooltipContent>
							<p>
								{m.provider} · temp {m.temperature}
							</p>
							<p className="text-muted-foreground">
								{i === 0 ? "Primary" : `Fallback ${i}`}
							</p>
						</TooltipContent>
					</Tooltip>
				))}
			</div>
		</TooltipProvider>
	)
}

export function LlmSettingsShell({
	initialCallSites,
}: {
	initialCallSites: LlmCallSiteRow[]
}) {
	const queryClient = useQueryClient()
	const [editingCallSite, setEditingCallSite] = useState<LlmCallSiteRow | null>(
		null,
	)

	const { data: callSites = initialCallSites } = useQuery({
		queryKey: queryKeys.llmCallSites(),
		queryFn: async () => {
			const result = await listLlmCallSites()
			if (!result.ok) throw new Error(result.error)
			return result.callSites
		},
		initialData: initialCallSites,
	})

	const seedMutation = useMutation({
		mutationFn: seedLlmCallSites,
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			toast.success(
				`Synced defaults: ${result.created} created, ${result.updated} updated`,
			)
			queryClient.invalidateQueries({ queryKey: queryKeys.llmCallSites() })
		},
		onError: () => toast.error("Failed to sync defaults"),
	})

	const updateMutation = useMutation({
		mutationFn: ({ id, models }: { id: string; models: LlmModelEntry[] }) =>
			updateLlmCallSiteModels(id, models),
		onMutate: async ({ id, models }) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.llmCallSites() })
			const previous = queryClient.getQueryData<LlmCallSiteRow[]>(
				queryKeys.llmCallSites(),
			)
			queryClient.setQueryData<LlmCallSiteRow[]>(
				queryKeys.llmCallSites(),
				(old) =>
					old?.map((cs) =>
						cs.id === id ? { ...cs, models, updated_at: new Date() } : cs,
					),
			)
			return { previous }
		},
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			toast.success("Model configuration updated")
			setEditingCallSite(null)
		},
		onError: (_err, _vars, context) => {
			queryClient.setQueryData(queryKeys.llmCallSites(), context?.previous)
			toast.error("Failed to update model configuration")
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.llmCallSites() })
		},
	})

	const resetMutation = useMutation({
		mutationFn: resetLlmCallSiteToDefault,
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			toast.success("Reset to defaults")
			setEditingCallSite(null)
			queryClient.invalidateQueries({ queryKey: queryKeys.llmCallSites() })
		},
		onError: () => toast.error("Failed to reset"),
	})

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">LLM Call Sites</h2>
				<Button
					variant="outline"
					size="sm"
					onClick={() => seedMutation.mutate()}
					disabled={seedMutation.isPending}
				>
					{seedMutation.isPending ? (
						<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
					) : (
						<RefreshCw className="h-3.5 w-3.5 mr-1.5" />
					)}
					Sync defaults
				</Button>
			</div>

			{callSites.length === 0 ? (
				<div className="rounded-lg border border-dashed p-8 text-center">
					<p className="text-muted-foreground mb-3">
						No call sites configured yet.
					</p>
					<Button
						onClick={() => seedMutation.mutate()}
						disabled={seedMutation.isPending}
					>
						{seedMutation.isPending && (
							<Loader2 className="h-4 w-4 mr-2 animate-spin" />
						)}
						Seed defaults
					</Button>
				</div>
			) : (
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[280px]">Call Site</TableHead>
								<TableHead className="w-[80px]">Input</TableHead>
								<TableHead>Model Chain</TableHead>
								<TableHead className="w-[60px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{callSites.map((cs) => {
								const inputConfig = INPUT_TYPE_CONFIG[cs.input_type]
								const InputIcon = inputConfig?.icon ?? Eye
								return (
									<TableRow key={cs.id}>
										<TableCell>
											<div>
												<p className="font-medium text-sm">{cs.display_name}</p>
												{cs.description && (
													<p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
														{cs.description}
													</p>
												)}
											</div>
										</TableCell>
										<TableCell>
											<Badge
												variant={inputConfig?.variant ?? "secondary"}
												className="gap-1"
											>
												<InputIcon className="h-3 w-3" />
												{inputConfig?.label ?? cs.input_type}
											</Badge>
										</TableCell>
										<TableCell>
											<ModelChainBadges models={cs.models} />
										</TableCell>
										<TableCell>
											<Button
												variant="ghost"
												size="icon-xs"
												onClick={() => setEditingCallSite(cs)}
												title="Edit models"
											>
												<Pencil className="h-3.5 w-3.5" />
											</Button>
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				</div>
			)}

			{editingCallSite && (
				<EditModelsDialog
					callSite={editingCallSite}
					open={!!editingCallSite}
					onOpenChange={(open) => {
						if (!open) setEditingCallSite(null)
					}}
					onSave={(models) =>
						updateMutation.mutate({ id: editingCallSite.id, models })
					}
					onReset={() => resetMutation.mutate(editingCallSite.id)}
					isSaving={updateMutation.isPending}
					isResetting={resetMutation.isPending}
				/>
			)}
		</div>
	)
}
