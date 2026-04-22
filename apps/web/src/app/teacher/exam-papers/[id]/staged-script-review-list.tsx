"use client"

import type { PageKey, StagedScript } from "@/lib/batch/types"
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core"
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"
import { AnimatePresence, motion } from "framer-motion"
import { FileText } from "lucide-react"
import {
	forwardRef,
	useCallback,
	useImperativeHandle,
	useRef,
	useState,
} from "react"
import { useStagedScriptsState } from "./hooks/use-staged-scripts-state"
import { ListViewScriptSection } from "./list-view-script-section"
import { PageCarousel } from "./page-carousel"

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeletedPage = {
	/** s3_key — used as stable identifier */
	pageKey: string
	/** Full page key data needed to restore the page */
	pageKeyData: PageKey
	/** Presigned URL for the thumbnail preview */
	url: string
	/** Script this page belonged to */
	scriptId: string
	scriptName: string
	/** Original page number shown in the restore list */
	originalOrder: number
}

export type StagedScriptReviewListHandle = {
	restorePage: (page: DeletedPage) => void
}

// ─── Props ────────────────────────────────────────────────────────────────────

type StagedScriptListProps = {
	paperId: string
	urls: Record<string, string>
	scripts: StagedScript[]
	onUpdateName: (scriptId: string, name: string) => void
	/** Must return a Promise so optimistic UI can be rolled back on failure. */
	onToggleExclude: (
		scriptId: string,
		currentStatus: StagedScript["status"],
	) => Promise<void>
	onDeleteScript?: (scriptId: string) => void
	/** Called after a page is removed from a script. Parent tracks for restore. */
	onPageDeleted?: (page: DeletedPage) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findScriptByPageKey(key: string, pool: StagedScript[]) {
	return pool.find((s) => s.page_keys.some((pk) => pk.s3_key === key))
}

// ─── Component ────────────────────────────────────────────────────────────────

export const StagedScriptReviewList = forwardRef<
	StagedScriptReviewListHandle,
	StagedScriptListProps
>(function StagedScriptReviewList(
	{
		paperId,
		urls,
		scripts,
		onUpdateName,
		onToggleExclude,
		onDeleteScript,
		onPageDeleted,
	},
	ref,
) {
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
	} = useStagedScriptsState(paperId, urls, scripts, onDeleteScript)

	// IDs of scripts optimistically removed from the list (flying to tray)
	const [optimisticConfirmedIds, setOptimisticConfirmedIds] = useState<
		Set<string>
	>(new Set())

	// ── Multi-select ──────────────────────────────────────────────────────────
	const [selectedPageKeys, setSelectedPageKeys] = useState<Set<string>>(
		new Set(),
	)

	function togglePageSelection(pageKey: string) {
		setSelectedPageKeys((prev) => {
			const next = new Set(prev)
			if (next.has(pageKey)) next.delete(pageKey)
			else next.add(pageKey)
			return next
		})
	}

	/** True once drag starts and >1 page is selected (set via ref for use in callbacks). */
	const isMultiDragRef = useRef(false)

	const dragSnapshotRef = useRef<StagedScript[] | null>(null)

	// ── Page deletion + restoration ───────────────────────────────────────────

	function handleDeletePage(pageKey: string) {
		const sourceScript = localScripts.find((s) =>
			s.page_keys.some((pk) => pk.s3_key === pageKey),
		)
		if (!sourceScript) return

		const pageKeyData = sourceScript.page_keys.find(
			(pk) => pk.s3_key === pageKey,
		)
		if (!pageKeyData) return

		const rollbackSnapshot = [...localScripts]
		const newPages = sourceScript.page_keys
			.filter((pk) => pk.s3_key !== pageKey)
			.map((pk, i) => ({ ...pk, order: i + 1 }))

		const updated = { ...sourceScript, page_keys: newPages }
		setLocalScripts((prev) =>
			prev.map((s) => (s.id === sourceScript.id ? updated : s)),
		)
		void persistPageKeys(updated, rollbackSnapshot)

		onPageDeleted?.({
			pageKey,
			pageKeyData,
			url: urls[pageKey] ?? "",
			scriptId: sourceScript.id,
			scriptName:
				localNames[sourceScript.id] ??
				sourceScript.proposed_name ??
				"Unnamed script",
			originalOrder: pageKeyData.order,
		})
	}

	// Use a ref for localScripts so the imperative handle never goes stale
	const localScriptsRef = useRef(localScripts)
	localScriptsRef.current = localScripts

	function handleRestorePage(page: DeletedPage) {
		const targetScript = localScriptsRef.current.find(
			(s) => s.id === page.scriptId,
		)
		if (!targetScript) return

		const restoredKey: PageKey = {
			...page.pageKeyData,
			order: targetScript.page_keys.length + 1,
		}
		const updated = {
			...targetScript,
			page_keys: [...targetScript.page_keys, restoredKey],
		}
		setLocalScripts((prev) =>
			prev.map((s) => (s.id === targetScript.id ? updated : s)),
		)
		void persistPageKeys(updated)
	}

	useImperativeHandle(ref, () => ({ restorePage: handleRestorePage }), [])

	// ── Toggle include/exclude ────────────────────────────────────────────────

	async function handleToggleInclude(
		scriptId: string,
		currentStatus: StagedScript["status"],
	) {
		const wasConfirmed = currentStatus === "confirmed"
		if (!wasConfirmed) {
			setOptimisticConfirmedIds((prev) => new Set([...prev, scriptId]))
		}
		try {
			await onToggleExclude(scriptId, currentStatus)
		} catch {
			if (!wasConfirmed) {
				setOptimisticConfirmedIds((prev) => {
					const next = new Set(prev)
					next.delete(scriptId)
					return next
				})
			}
		}
	}

	// ── DnD handlers ──────────────────────────────────────────────────────────

	function handleDragStart(event: DragStartEvent) {
		isDraggingRef.current = true
		dragSnapshotRef.current = localScripts.map((s) => ({
			...s,
			page_keys: [...s.page_keys],
		}))
		const key = event.active.id as string

		// Multi-drag: carry the group if the dragged key is already selected.
		// Dragging an unselected key cancels the selection and drags only that page.
		const isGroupDrag = selectedPageKeys.has(key) && selectedPageKeys.size > 1
		isMultiDragRef.current = isGroupDrag
		if (!selectedPageKeys.has(key)) {
			setSelectedPageKeys(new Set())
		}

		setActiveDrag({
			key,
			url: urls[key] ?? "",
			count: isGroupDrag ? selectedPageKeys.size : 1,
		})
	}

	// Only handle within-script reordering during drag-over.
	// Cross-script moves are deferred to handleDragEnd to avoid the active
	// draggable being removed from its SortableContext mid-drag, which causes
	// dnd-kit to throw a client-side exception.
	const handleDragOver = useCallback(
		(event: DragOverEvent) => {
			// Within-script reordering is undefined for a group — skip entirely.
			if (isMultiDragRef.current) return

			const { active, over } = event
			if (!over) return

			const dragKey = active.id as string
			const overId = over.id as string
			if (dragKey === overId) return

			setLocalScripts((prev) => {
				const sourceScript = findScriptByPageKey(dragKey, prev)
				if (!sourceScript) return prev

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
		const isMultiDrag = isMultiDragRef.current
		isMultiDragRef.current = false

		if (!over) {
			if (snapshot) setLocalScripts(snapshot)
			return
		}

		const dragKey = active.id as string
		const overId = over.id as string

		const sourceScript = findScriptByPageKey(dragKey, localScripts)
		if (!sourceScript) return

		const overIsPage = localScripts.some((s) =>
			s.page_keys.some((pk) => pk.s3_key === overId),
		)
		const targetScript = overIsPage
			? findScriptByPageKey(overId, localScripts)
			: (localScripts.find((s) => s.id === overId) ?? null)

		const isCrossScript =
			targetScript != null &&
			targetScript.id !== sourceScript.id &&
			targetScript.status !== "confirmed"

		if (isCrossScript && targetScript) {
			if (isMultiDrag) {
				// ── Multi-page cross-script move ──────────────────────────────────
				// Build a mutable map of script state so we can remove pages from
				// multiple sources and add them all to the target in one pass.
				const scriptUpdates = new Map<string, StagedScript>()

				for (const pageKey of selectedPageKeys) {
					const src = findScriptByPageKey(pageKey, localScripts)
					// Skip pages already in the target, or in confirmed scripts
					if (!src || src.id === targetScript.id || src.status === "confirmed")
						continue

					const pageKeyData = src.page_keys.find((pk) => pk.s3_key === pageKey)
					if (!pageKeyData) continue

					// Remove from source
					const currentSrc = scriptUpdates.get(src.id) ?? {
						...src,
						page_keys: [...src.page_keys],
					}
					scriptUpdates.set(src.id, {
						...currentSrc,
						page_keys: currentSrc.page_keys
							.filter((pk) => pk.s3_key !== pageKey)
							.map((pk, i) => ({ ...pk, order: i + 1 })),
					})

					// Append to target (accumulate in map)
					const currentTarget = scriptUpdates.get(targetScript.id) ?? {
						...targetScript,
						page_keys: [...targetScript.page_keys],
					}
					scriptUpdates.set(targetScript.id, {
						...currentTarget,
						page_keys: [...currentTarget.page_keys, pageKeyData],
					})
				}

				// Final ordering pass on target
				const finalTarget = scriptUpdates.get(targetScript.id)
				if (finalTarget) {
					scriptUpdates.set(targetScript.id, {
						...finalTarget,
						page_keys: finalTarget.page_keys.map((pk, i) => ({
							...pk,
							order: i + 1,
						})),
					})
				}

				setLocalScripts((prev) => prev.map((s) => scriptUpdates.get(s.id) ?? s))
				for (const updated of scriptUpdates.values()) {
					void persistPageKeys(updated, snapshot ?? undefined)
				}
				setSelectedPageKeys(new Set())
				return
			}

			// ── Single-page cross-script move ─────────────────────────────────
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
			void persistPageKeys(updatedSource, snapshot ?? undefined)
			void persistPageKeys(updatedTarget, snapshot ?? undefined)
			return
		}

		// ── Within-script persist (single drag only) ──────────────────────────
		if (!isMultiDrag && snapshot) {
			for (const current of localScripts) {
				const original = snapshot.find((s) => s.id === current.id)
				if (!original) continue
				const currentKeys = current.page_keys.map((pk) => pk.s3_key).join(",")
				const originalKeys = original.page_keys.map((pk) => pk.s3_key).join(",")
				if (currentKeys !== originalKeys) {
					void persistPageKeys(current, snapshot)
				}
			}
		}
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
				<div className="space-y-4">
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
									selectedPageKeys={selectedPageKeys}
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
									onToggleSelectPage={togglePageSelection}
								/>
							</motion.div>
						))}
					</AnimatePresence>
				</div>

				<DragOverlay dropAnimation={null}>
					{activeDrag ? (
						<div className="relative">
							{/* Ghost layer — suggests a stack when dragging multiple pages */}
							{activeDrag.count > 1 && (
								<div className="absolute inset-0 w-50 h-70.75 rounded-md border-2 border-primary/50 bg-primary/10 translate-x-2 translate-y-2" />
							)}
							{activeDrag.url ? (
								<div className="relative w-50 h-70.75 rounded-md border-2 border-primary shadow-xl overflow-hidden rotate-1 opacity-90">
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img
										src={activeDrag.url}
										alt="Dragging"
										className="w-full h-full object-cover"
										draggable={false}
									/>
								</div>
							) : (
								<div className="relative w-50 h-70.75 rounded-md border-2 border-primary shadow-xl flex items-center justify-center bg-card rotate-1">
									<FileText className="h-8 w-8 text-muted-foreground/30" />
								</div>
							)}
							{/* Count badge for multi-drag */}
							{activeDrag.count > 1 && (
								<div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow-md">
									{activeDrag.count}
								</div>
							)}
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
})
