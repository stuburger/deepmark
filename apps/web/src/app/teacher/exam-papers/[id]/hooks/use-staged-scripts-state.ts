"use client"

import {
	deleteStagedScript,
	updateStagedScriptPageKeys,
} from "@/lib/batch/scripts/mutations"
import type { StagedScript } from "@/lib/batch/types"
import { queryKeys } from "@/lib/query-keys"
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { usePageCarousel } from "./use-page-carousel"

type ActiveDragState = {
	key: string
	url: string
	/** Number of pages being dragged (1 for single, >1 for multi-select drag) */
	count: number
}

export type { ActiveDragState }

export function useStagedScriptsState(
	paperId: string,
	scripts: StagedScript[],
	onDeleteScript?: (scriptId: string) => void,
) {
	const queryClient = useQueryClient()

	const [localScripts, setLocalScripts] = useState(scripts)
	const [localNames, setLocalNames] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			scripts.map((s) => [s.id, s.confirmed_name ?? s.proposed_name ?? ""]),
		),
	)
	const [activeDrag, setActiveDrag] = useState<ActiveDragState | null>(null)
	const isDraggingRef = useRef(false)

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	)

	const {
		carousel,
		setCarousel,
		openCarousel: openPageCarousel,
	} = usePageCarousel()

	// Sync local scripts from server data without disrupting local ordering.
	// Instead of wholesale-replacing local state (which resets to server's
	// created_at order every 3s poll), we merge: existing scripts stay in
	// their local position with updated content, deleted scripts are removed,
	// and brand-new scripts are prepended so they appear at the top of the
	// list (visible without scrolling).
	useEffect(() => {
		if (isDraggingRef.current) return
		setLocalScripts((prevLocal) => {
			const serverById = new Map(scripts.map((s) => [s.id, s]))
			const localById = new Map(prevLocal.map((s) => [s.id, s]))

			// Keep existing scripts in their current local order, updating content
			const merged = prevLocal
				.filter((s) => serverById.has(s.id))
				.map((s) => serverById.get(s.id) ?? s)

			// Prepend scripts that are new on the server (e.g. added via "Add script")
			// so they land at the top of the list without requiring a scroll.
			const brandNew = scripts.filter((s) => !localById.has(s.id))

			return [...brandNew, ...merged]
		})
	}, [scripts])

	function openCarousel(script: StagedScript, startIndex: number) {
		const name = localNames[script.id] ?? script.proposed_name ?? ""
		openPageCarousel(script, startIndex, name)
	}

	// ── Page-key persistence ─────────────────────────────────────────────────
	//
	// Called after local state has already been updated optimistically. The
	// optional `rollbackSnapshot` is restored on failure so the UI doesn't
	// show an arrangement the server doesn't have.

	async function persistPageKeys(
		script: StagedScript,
		rollbackSnapshot?: StagedScript[],
	) {
		const r = await updateStagedScriptPageKeys(script.id, script.page_keys)
		if (!r.ok) {
			if (rollbackSnapshot) setLocalScripts(rollbackSnapshot)
			toast.error("Failed to save page layout — changes reverted")
			return
		}
		void queryClient.invalidateQueries({
			queryKey: queryKeys.activeBatch(paperId),
		})
	}

	// ── Script deletion ──────────────────────────────────────────────────────
	//
	// Optimistic: the script disappears immediately; restored on server error.

	const deleteScriptMutation = useMutation({
		mutationFn: async ({
			scriptId,
		}: {
			scriptId: string
			snapshot: StagedScript[]
			snapshotNames: Record<string, string>
		}) => {
			const r = await deleteStagedScript(scriptId)
			if (!r.ok) throw new Error(r.error)
		},
		onError: (err, vars) => {
			setLocalScripts(vars.snapshot)
			setLocalNames(vars.snapshotNames)
			toast.error(
				err instanceof Error ? err.message : "Failed to delete script",
			)
		},
		onSettled: (_, __, vars) => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.activeBatch(paperId),
			})
			onDeleteScript?.(vars.scriptId)
		},
	})

	function handleDelete(scriptId: string) {
		// Capture snapshots before the optimistic removal
		const snapshot = [...localScripts]
		const snapshotNames = { ...localNames }

		setLocalScripts((prev) => prev.filter((s) => s.id !== scriptId))
		setLocalNames((prev) => {
			const next = { ...prev }
			delete next[scriptId]
			return next
		})

		deleteScriptMutation.mutate({ scriptId, snapshot, snapshotNames })
	}

	return {
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
	}
}
