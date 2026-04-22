"use client"

import { Button } from "@/components/ui/button"
import type { StagedScript } from "@/lib/batch/types"
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core"
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"
import { AnimatePresence, motion } from "framer-motion"
import { FileText, Plus } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { useStagedScriptsState } from "./hooks/use-staged-scripts-state"
import { ListViewScriptSection } from "./list-view-script-section"
import { PageCarousel } from "./staged-script-page-editor"

type StagedScriptListProps = {
	urls: Record<string, string>
	scripts: StagedScript[]
	onUpdateName: (scriptId: string, name: string) => void
	onToggleExclude: (scriptId: string, currentStatus: string) => void
	onDeleteScript?: (scriptId: string) => void
	onAddScript?: () => Promise<void>
}

function findScriptByPageKey(key: string, pool: StagedScript[]) {
	return pool.find((s) => s.page_keys.some((pk) => pk.s3_key === key))
}

export function StagedScriptReviewList({
	urls,
	scripts,
	onUpdateName,
	onToggleExclude,
	onDeleteScript,
	onAddScript,
}: StagedScriptListProps) {
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

	// IDs of scripts optimistically removed from the list (flying to tray)
	const [optimisticConfirmedIds, setOptimisticConfirmedIds] = useState<
		Set<string>
	>(new Set())

	const dragSnapshotRef = useRef<StagedScript[] | null>(null)

	function handleDeletePage(pageKey: string) {
		const sourceScript = localScripts.find((s) =>
			s.page_keys.some((pk) => pk.s3_key === pageKey),
		)
		if (!sourceScript) return

		const newPages = sourceScript.page_keys
			.filter((pk) => pk.s3_key !== pageKey)
			.map((pk, i) => ({ ...pk, order: i + 1 }))

		const updated = { ...sourceScript, page_keys: newPages }
		setLocalScripts((prev) =>
			prev.map((s) => (s.id === sourceScript.id ? updated : s)),
		)
		void persistPageKeys(updated)
	}

	function handleToggleInclude(scriptId: string, currentStatus: string) {
		// Optimistically hide the script immediately so the exit animation fires
		// before the server round-trip + refetch completes
		if (currentStatus !== "confirmed") {
			setOptimisticConfirmedIds((prev) => new Set([...prev, scriptId]))
		} else {
			setOptimisticConfirmedIds((prev) => {
				const next = new Set(prev)
				next.delete(scriptId)
				return next
			})
		}
		onToggleExclude(scriptId, currentStatus)
	}

	// ── DnD handlers ──────────────────────────────────────────────────────────

	function handleDragStart(event: DragStartEvent) {
		isDraggingRef.current = true
		dragSnapshotRef.current = localScripts.map((s) => ({
			...s,
			page_keys: [...s.page_keys],
		}))
		const key = event.active.id as string
		setActiveDrag({ key, url: urls[key] ?? "" })
	}

	// Only handle within-script reordering during drag-over.
	// Cross-script moves are deferred to handleDragEnd to avoid the active
	// draggable being removed from its SortableContext mid-drag, which causes
	// dnd-kit to throw a client-side exception.
	const handleDragOver = useCallback(
		(event: DragOverEvent) => {
			const { active, over } = event
			if (!over) return

			const dragKey = active.id as string
			const overId = over.id as string
			if (dragKey === overId) return

			setLocalScripts((prev) => {
				const sourceScript = findScriptByPageKey(dragKey, prev)
				if (!sourceScript) return prev

				// Only reorder within the same script
				const overIsPageInSource = sourceScript.page_keys.some(
					(pk) => pk.s3_key === overId,
				)
				if (!overIsPageInSource) return prev

				const pages = sourceScript.page_keys
				const oldIdx = pages.findIndex((pk) => pk.s3_key === dragKey)
				const newIdx = pages.findIndex((pk) => pk.s3_key === overId)
				if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prev

				const reordered = arrayMove(pages, oldIdx, newIdx).map((pk, i) => ({
					...pk,
					order: i + 1,
				}))
				return prev.map((s) =>
					s.id === sourceScript.id ? { ...s, page_keys: reordered } : s,
				)
			})
		},
		[setLocalScripts],
	)

	function handleDragEnd(event: DragEndEvent) {
		isDraggingRef.current = false
		const { over, active } = event
		setActiveDrag(null)
		const snapshot = dragSnapshotRef.current
		dragSnapshotRef.current = null

		if (!over) {
			if (snapshot) setLocalScripts(snapshot)
			return
		}

		const dragKey = active.id as string
		const overId = over.id as string

		const sourceScript = findScriptByPageKey(dragKey, localScripts)
		if (!sourceScript) return

		// Determine if this is a cross-script move
		const overIsPage = localScripts.some((s) =>
			s.page_keys.some((pk) => pk.s3_key === overId),
		)
		const targetScript = overIsPage
			? findScriptByPageKey(overId, localScripts)
			: (localScripts.find((s) => s.id === overId) ?? null)

		const isCrossScript =
			targetScript !== null &&
			targetScript.id !== sourceScript.id &&
			targetScript.status !== "confirmed"

		if (isCrossScript && targetScript) {
			// Apply the cross-script move now and persist both scripts
			const draggedPage = sourceScript.page_keys.find(
				(pk) => pk.s3_key === dragKey,
			)
			if (!draggedPage) return

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
			return
		}

		// Within-script: persist any reorder changes vs the snapshot
		if (snapshot) {
			for (const current of localScripts) {
				const original = snapshot.find((s) => s.id === current.id)
				if (!original) continue
				const currentKeys = current.page_keys.map((pk) => pk.s3_key).join(",")
				const originalKeys = original.page_keys.map((pk) => pk.s3_key).join(",")
				if (currentKeys !== originalKeys) {
					void persistPageKeys(current)
				}
			}
		}
	}

	// ── Render ────────────────────────────────────────────────────────────────

	const visibleScripts = localScripts.filter(
		(s) => !optimisticConfirmedIds.has(s.id),
	)

	const [addingScript, setAddingScript] = useState(false)

	async function handleAddScript() {
		if (!onAddScript) return
		setAddingScript(true)
		try {
			await onAddScript()
		} finally {
			setAddingScript(false)
		}
	}

	return (
		<>
			<DndContext
				id="staged-script-review"
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragStart={handleDragStart}
				onDragOver={handleDragOver}
				onDragEnd={handleDragEnd}
			>
				<div className="space-y-12">
					<AnimatePresence mode="popLayout">
						{visibleScripts.map((script) => (
							<motion.div
								key={script.id}
								layout
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{
									opacity: 0,
									x: 180,
									y: 0,
									scale: 0.75,
									transition: { duration: 0.28, ease: "easeIn" },
								}}
							>
								<ListViewScriptSection
									script={script}
									localName={localNames[script.id] ?? ""}
									urls={urls}
									onOpenCarousel={openCarousel}
									onUpdateLocalName={(value) =>
										setLocalNames((prev) => ({
											...prev,
											[script.id]: value,
										}))
									}
									onUpdateName={(name) => onUpdateName(script.id, name)}
									onToggleInclude={() =>
										handleToggleInclude(script.id, script.status)
									}
									onDelete={() => handleDelete(script.id)}
									onDeletePage={handleDeletePage}
								/>
							</motion.div>
						))}
					</AnimatePresence>
				</div>

				<DragOverlay dropAnimation={null}>
					{activeDrag?.url ? (
						<div className="w-[200px] h-[283px] rounded-md border-2 border-primary shadow-xl overflow-hidden rotate-1 opacity-90">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={activeDrag.url}
								alt="Dragging"
								className="w-full h-full object-cover"
								draggable={false}
							/>
						</div>
					) : activeDrag ? (
						<div className="w-[200px] h-[283px] rounded-md border-2 border-primary shadow-xl flex items-center justify-center bg-card rotate-1">
							<FileText className="h-8 w-8 text-muted-foreground/30" />
						</div>
					) : null}
				</DragOverlay>
			</DndContext>

			{onAddScript && (
				<div className="pt-4">
					<Button
						variant="outline"
						size="sm"
						className="w-full gap-1.5 border-dashed text-muted-foreground hover:text-foreground"
						onClick={handleAddScript}
						disabled={addingScript}
					>
						<Plus className="h-3.5 w-3.5" />
						Add script
					</Button>
				</div>
			)}

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
