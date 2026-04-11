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
import {
	LLM_CALL_SITE_DEFAULTS,
	LLM_PHASE_DESCRIPTIONS,
	LLM_PHASE_LABELS,
	LLM_PHASE_ORDER,
} from "@mcp-gcse/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	ArrowDown,
	ChevronDown,
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
				<div className="space-y-2">
					{LLM_PHASE_ORDER.flatMap((phase, phaseIdx) => {
						const phaseCallSites = callSites.filter((cs) => cs.phase === phase)
						if (phaseCallSites.length === 0) return []

						// Group call sites by step number. Same step = parallel.
						const stepLookup = new Map(
							LLM_CALL_SITE_DEFAULTS.map((d) => [d.key, d.step]),
						)
						const stepGroups: Array<{
							step: number
							sites: typeof phaseCallSites
						}> = []
						for (const cs of phaseCallSites) {
							const step = stepLookup.get(cs.key) ?? 0
							const existing = stepGroups.find((g) => g.step === step)
							if (existing) {
								existing.sites.push(cs)
							} else {
								stepGroups.push({ step, sites: [cs] })
							}
						}

						const elements: React.ReactNode[] = []
						if (phaseIdx > 0) {
							elements.push(
								<div
									key={`arrow-${phase}`}
									className="flex justify-center py-1 text-muted-foreground/40"
								>
									<ChevronDown className="h-5 w-5" />
								</div>,
							)
						}

						elements.push(
							<div key={phase} className="space-y-1.5">
								<div className="px-1">
									<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
										{LLM_PHASE_LABELS[phase]}
									</h3>
									<p className="text-xs text-muted-foreground/70 mt-0.5">
										{LLM_PHASE_DESCRIPTIONS[phase]}
									</p>
								</div>
								<div className="rounded-lg border">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="w-[36px]" />
												<TableHead className="w-[260px]">Call Site</TableHead>
												<TableHead className="w-[80px]">Input</TableHead>
												<TableHead>Model Chain</TableHead>
												<TableHead className="w-[60px]" />
											</TableRow>
										</TableHeader>
										<TableBody>
											{stepGroups.flatMap((group, groupIdx) => {
												const isLastGroup = groupIdx === stepGroups.length - 1
												const isParallel = group.sites.length > 1
												return group.sites.map((cs, i) => {
													const inputConfig = INPUT_TYPE_CONFIG[cs.input_type]
													const InputIcon = inputConfig?.icon ?? Eye
													const isFirstInGroup = i === 0
													const isLastInGroup = i === group.sites.length - 1
													return (
														<TableRow key={cs.id}>
															<TableCell className="text-center pr-0 align-middle">
																<div className="flex flex-col items-center">
																	{isParallel ? (
																		<>
																			{isFirstInGroup && (
																				<span className="text-[9px] font-mono text-muted-foreground/50 mb-0.5">
																					parallel
																				</span>
																			)}
																			<div
																				className={`w-0.5 bg-muted-foreground/20 ${isFirstInGroup ? "rounded-t" : ""} ${isLastInGroup ? "rounded-b" : ""}`}
																				style={{ height: "20px" }}
																			/>
																		</>
																	) : (
																		<span className="text-[10px] font-mono text-muted-foreground/40 tabular-nums">
																			{group.step}
																		</span>
																	)}
																	{isLastInGroup && !isLastGroup && (
																		<ArrowDown className="h-3 w-3 text-muted-foreground/30 mt-1" />
																	)}
																</div>
															</TableCell>
															<TableCell>
																<div>
																	<p className="font-medium text-sm">
																		{cs.display_name}
																	</p>
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
												})
											})}
										</TableBody>
									</Table>
								</div>
							</div>,
						)

						return elements
					})}
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
