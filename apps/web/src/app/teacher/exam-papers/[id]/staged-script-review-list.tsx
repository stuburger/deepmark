"use client"

import type { StagedScript } from "@/lib/batch/types"
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core"
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"
import { AnimatePresence, motion } from "framer-motion"
import { FileText } from "lucide-react"
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

				const overIsPage = prev.some((s) =>
					s.page_keys.some((pk) => pk.s3_key === overId),
				)
				const targetScript = overIsPage
					? findScriptByPageKey(overId, prev)
					: (prev.find((s) => s.id === overId) ?? null)

				if (!targetScript) return prev
				if (targetScript.status === "confirmed") return prev
				if (sourceScript.id === targetScript.id) return prev

				const draggedPage = sourceScript.page_keys.find(
					(pk) => pk.s3_key === dragKey,
				)
				if (!draggedPage) return prev

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

				return prev.map((s) => {
					if (s.id === sourceScript.id)
						return { ...s, page_keys: newSourcePages }
					if (s.id === targetScript.id)
						return { ...s, page_keys: newTargetPages }
					return s
				})
			})
		},
		[setLocalScripts],
	)

	function handleDragEnd(event: DragEndEvent) {
		isDraggingRef.current = false
		const { over, active } = event
		setActiveDrag(null)

		if (!over) {
			if (dragSnapshotRef.current) {
				setLocalScripts(dragSnapshotRef.current)
			}
			dragSnapshotRef.current = null
			return
		}

		const dragKey = active.id as string
		const overId = over.id as string

		const sourceScript = findScriptByPageKey(dragKey, localScripts)
		if (!sourceScript) {
			dragSnapshotRef.current = null
			return
		}

		const overIsPageInSame = sourceScript.page_keys.some(
			(pk) => pk.s3_key === overId,
		)
		if (overIsPageInSame && dragKey !== overId) {
			const pages = sourceScript.page_keys
			const oldIdx = pages.findIndex((pk) => pk.s3_key === dragKey)
			const newIdx = pages.findIndex((pk) => pk.s3_key === overId)
			if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
				const reordered = arrayMove(pages, oldIdx, newIdx).map((pk, i) => ({
					...pk,
					order: i + 1,
				}))
				const updated = { ...sourceScript, page_keys: reordered }
				setLocalScripts((prev) =>
					prev.map((s) => (s.id === sourceScript.id ? updated : s)),
				)
				void persistPageKeys(updated)
				dragSnapshotRef.current = null
				return
			}
		}

		const snapshot = dragSnapshotRef.current
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
		dragSnapshotRef.current = null
	}

	// ── Render ────────────────────────────────────────────────────────────────

	const visibleScripts = localScripts.filter(
		(s) => !optimisticConfirmedIds.has(s.id),
	)

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
