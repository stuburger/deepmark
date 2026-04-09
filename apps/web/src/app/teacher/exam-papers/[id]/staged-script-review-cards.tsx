"use client"

import type { StagedScript } from "@/lib/batch/types"
import { DndContext, DragOverlay } from "@dnd-kit/core"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"
import { DndScriptCard } from "./dnd-script-card"
import { useStagedScriptsState } from "./hooks/use-staged-scripts-state"
import { OversizedScriptBanner } from "./oversized-script-banner"
import { PageCarousel } from "./staged-script-page-editor"

type StagedScriptCardProps = {
	urls: Record<string, string>
	scripts: StagedScript[]
	pagesPerScript?: number
	classificationMode?: string
	onUpdateName: (scriptId: string, name: string) => void
	onToggleExclude: (scriptId: string, currentStatus: string) => void
	onSplitScript?: (scriptId: string, splitAfterIndex: number) => void
	onDeleteScript?: (scriptId: string) => void
}

export function StagedScriptReviewCards({
	urls,
	scripts,
	pagesPerScript,
	classificationMode,
	onUpdateName,
	onToggleExclude,
	onSplitScript,
	onDeleteScript,
}: StagedScriptCardProps) {
	const {
		localScripts,
		setLocalScripts,
		localNames,
		setLocalNames,
		activeDrag,
		setActiveDrag,
		carousel,
		setCarousel,
		isDraggingRef,
		sensors,
		openCarousel,
		persistPageKeys,
		handleDelete,
	} = useStagedScriptsState(urls, scripts, onDeleteScript)

	// ── DnD handlers ──────────────────────────────────────────────────────────

	function handleDragStart(event: DragStartEvent) {
		isDraggingRef.current = true
		const key = event.active.id as string
		setActiveDrag({ key, url: urls[key] ?? "" })
	}

	function handleDragEnd(event: DragEndEvent) {
		isDraggingRef.current = false
		const { over, active } = event
		setActiveDrag(null)
		if (!over || over.id === active.id) return

		const dragKey = active.id as string
		const overId = over.id as string

		const sourceScript = localScripts.find((s) =>
			s.page_keys.some((pk) => pk.s3_key === dragKey),
		)
		if (!sourceScript) return

		const overIsPage = localScripts.some((s) =>
			s.page_keys.some((pk) => pk.s3_key === overId),
		)
		const targetScript = overIsPage
			? localScripts.find((s) =>
					s.page_keys.some((pk) => pk.s3_key === overId),
				)!
			: (localScripts.find((s) => s.id === overId) ?? null)

		if (!targetScript) return

		// ── Same script: reorder ───────────────────────────────────────────────
		if (sourceScript.id === targetScript.id) {
			const pages = sourceScript.page_keys
			const oldIdx = pages.findIndex((pk) => pk.s3_key === dragKey)
			const newIdx = pages.findIndex((pk) => pk.s3_key === overId)
			if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return
			const reordered = arrayMove(pages, oldIdx, newIdx).map((pk, i) => ({
				...pk,
				order: i + 1,
			}))
			const updated = { ...sourceScript, page_keys: reordered }
			setLocalScripts((prev) =>
				prev.map((s) => (s.id === sourceScript.id ? updated : s)),
			)
			void persistPageKeys(updated)
			return
		}

		// ── Cross-script: remove from source, insert into target ──────────────
		const draggedPage = sourceScript.page_keys.find(
			(pk) => pk.s3_key === dragKey,
		)!
		const newSourcePages = sourceScript.page_keys
			.filter((pk) => pk.s3_key !== dragKey)
			.map((pk, i) => ({ ...pk, order: i + 1 }))

		const targetPages = [...targetScript.page_keys]
		if (overIsPage) {
			const insertAt = targetPages.findIndex((pk) => pk.s3_key === overId)
			targetPages.splice(
				insertAt === -1 ? targetPages.length : insertAt,
				0,
				draggedPage,
			)
		} else {
			targetPages.push(draggedPage)
		}
		const newTargetPages = targetPages.map((pk, i) => ({
			...pk,
			order: i + 1,
		}))

		const updatedSource = { ...sourceScript, page_keys: newSourcePages }
		const updatedTarget = { ...targetScript, page_keys: newTargetPages }

		setLocalScripts((prev) =>
			prev.map((s) => {
				if (s.id === sourceScript.id) return updatedSource
				if (s.id === targetScript.id) return updatedTarget
				return s
			}),
		)
		void persistPageKeys(updatedSource)
		void persistPageKeys(updatedTarget)
	}

	return (
		<>
			<DndContext
				sensors={sensors}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
			>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{localScripts.map((script) => {
						const pageCount = script.page_keys.length
						const isOversized =
							classificationMode === "per_file" &&
							pagesPerScript !== undefined &&
							pageCount > pagesPerScript * 2

						return (
							<div key={script.id} className="flex flex-col gap-2">
								{isOversized && onSplitScript && (
									<OversizedScriptBanner
										scriptId={script.id}
										pageCount={pageCount}
										pagesPerScript={pagesPerScript}
										onSplit={onSplitScript}
									/>
								)}
								<DndScriptCard
									script={script}
									localNames={localNames}
									urls={urls}
									activeDragKey={activeDrag?.key ?? null}
									onOpenCarousel={openCarousel}
									onUpdateLocalName={(id, value) =>
										setLocalNames((prev) => ({ ...prev, [id]: value }))
									}
									onUpdateName={onUpdateName}
									onToggleExclude={onToggleExclude}
									onDelete={handleDelete}
								/>
							</div>
						)
					})}
				</div>

				<DragOverlay dropAnimation={null}>
					{activeDrag?.url ? (
						<div className="w-14 h-20 rounded border-2 border-primary shadow-xl overflow-hidden rotate-1 opacity-90">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={activeDrag.url}
								alt="Dragging"
								className="w-full h-full object-cover"
								draggable={false}
							/>
						</div>
					) : null}
				</DragOverlay>
			</DndContext>

			{/* Page carousel */}
			{carousel && (
				<PageCarousel
					pages={carousel.pages}
					index={carousel.index}
					scriptName={carousel.scriptName}
					onClose={() => setCarousel(null)}
					onNavigate={(i) =>
						setCarousel((prev) => (prev ? { ...prev, index: i } : prev))
					}
				/>
			)}
		</>
	)
}
