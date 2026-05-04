"use client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import type { StagedScript } from "@/lib/batch/types"
import { stagedScriptScanPageUrl } from "@/lib/scan-url"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable"
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react"
import { ListViewPageItem } from "./list-view-page-item"

type ListViewScriptSectionProps = {
	batchId: string
	script: StagedScript
	localName: string
	selectedPageKeys: Set<string>
	collapsed: boolean
	onCollapsedChange: (collapsed: boolean) => void
	onToggleInclude: () => void
	onOpenCarousel: (script: StagedScript, index: number) => void
	onUpdateLocalName: (value: string) => void
	onUpdateName: (name: string) => void
	onDelete: () => void
	onDeletePage: (pageKey: string) => void
	onToggleSelectPage: (pageKey: string) => void
}

export function ListViewScriptSection({
	batchId,
	script,
	localName,
	selectedPageKeys,
	collapsed,
	onCollapsedChange,
	onToggleInclude,
	onOpenCarousel,
	onUpdateLocalName,
	onUpdateName,
	onDelete,
	onDeletePage,
	onToggleSelectPage,
}: ListViewScriptSectionProps) {
	const pageKeys = script.page_keys.slice().sort((a, b) => a.order - b.order)
	const pageKeyIds = pageKeys.map((pk) => pk.s3_key)
	const isIncluded = script.status === "confirmed"

	function handleToggleInclude() {
		// Including ⇒ assume we're done, collapse. Excluding ⇒ expand for review.
		onCollapsedChange(!isIncluded)
		onToggleInclude()
	}

	const { setNodeRef, isOver } = useDroppable({ id: script.id })

	return (
		<div className="rounded-xl border bg-card">
			{/* Card header — sticky so the student name + actions stay visible while scrolling pages */}
			<div
				className={`flex items-center gap-3 sticky top-0 z-10 bg-muted/50 backdrop-blur rounded-t-xl px-4 py-3 ${
					collapsed ? "rounded-b-xl" : "border-b"
				}`}
			>
				<div className="flex-1 min-w-0">
					<Input
						value={localName}
						onChange={(e) => onUpdateLocalName(e.target.value)}
						onBlur={() => onUpdateName(localName)}
						placeholder="Student name"
						className="h-8 text-sm font-medium max-w-70"
					/>
				</div>

				<div className="flex items-center gap-2 shrink-0">
					<Button
						size="sm"
						variant="ghost"
						className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-destructive"
						onClick={onDelete}
					>
						<Trash2 className="h-3 w-3" />
						Delete
					</Button>

					<label
						htmlFor={`include-${script.id}`}
						className="flex items-center gap-1.5 text-xs font-medium cursor-pointer pl-1 select-none"
					>
						<Checkbox
							id={`include-${script.id}`}
							checked={isIncluded}
							onCheckedChange={handleToggleInclude}
							className="data-checked:border-success-600 data-checked:bg-success-600 dark:data-checked:bg-success-600"
							aria-label={
								isIncluded ? "Remove from marking tray" : "Include for marking"
							}
						/>
						Include
					</label>

					<Button
						size="icon"
						variant="ghost"
						className="h-7 w-7 text-muted-foreground"
						onClick={() => onCollapsedChange(!collapsed)}
						aria-label={collapsed ? "Expand script" : "Collapse script"}
						title={collapsed ? "Expand" : "Collapse"}
					>
						{collapsed ? (
							<ChevronDown className="h-4 w-4" />
						) : (
							<ChevronUp className="h-4 w-4" />
						)}
					</Button>
				</div>
			</div>

			{/* Sortable pages — tiled horizontally */}
			{!collapsed && (
				<div
					ref={setNodeRef}
					className={`p-4 transition-colors rounded-b-xl ${
						isOver ? "ring-2 ring-inset ring-primary/30 bg-primary/5" : ""
					}`}
				>
					<SortableContext
						id={script.id}
						items={pageKeyIds}
						strategy={rectSortingStrategy}
					>
						{pageKeys.length === 0 ? (
							<div className="flex items-center justify-center h-20 rounded-lg border-2 border-dashed text-xs text-muted-foreground">
								{isOver ? "Drop here" : "No pages"}
							</div>
						) : (
							<div className="flex flex-wrap gap-2">
								{pageKeys.map((pk, idx) => (
									<ListViewPageItem
										key={pk.s3_key}
										pageKey={pk.s3_key}
										url={stagedScriptScanPageUrl(batchId, script.id, pk.order)}
										index={idx}
										isSelected={selectedPageKeys.has(pk.s3_key)}
										onLightbox={() => onOpenCarousel(script, idx)}
										onDelete={() => onDeletePage(pk.s3_key)}
										onToggleSelect={() => onToggleSelectPage(pk.s3_key)}
									/>
								))}
							</div>
						)}
					</SortableContext>
				</div>
			)}
		</div>
	)
}
