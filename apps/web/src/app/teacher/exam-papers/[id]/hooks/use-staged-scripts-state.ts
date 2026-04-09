"use client"

import {
	deleteStagedScript,
	updateStagedScriptPageKeys,
} from "@/lib/batch/mutations"
import type { StagedScript } from "@/lib/batch/types"
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { PageItem } from "../staged-script-page-editor"

type CarouselState = {
	pages: PageItem[]
	index: number
	scriptName: string
}

type ActiveDragState = {
	key: string
	url: string
}

export type { CarouselState, ActiveDragState }

export function useStagedScriptsState(
	urls: Record<string, string>,
	scripts: StagedScript[],
	onDeleteScript?: (scriptId: string) => void,
) {
	const [localScripts, setLocalScripts] = useState(scripts)
	const [localNames, setLocalNames] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			scripts.map((s) => [s.id, s.confirmed_name ?? s.proposed_name ?? ""]),
		),
	)
	const [activeDrag, setActiveDrag] = useState<ActiveDragState | null>(null)
	const [carousel, setCarousel] = useState<CarouselState | null>(null)
	const isDraggingRef = useRef(false)

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	)

	// Sync local scripts from updated props, skip mid-drag
	useEffect(() => {
		if (!isDraggingRef.current) {
			setLocalScripts(scripts)
		}
	}, [scripts])

	function openCarousel(
		script: StagedScript,
		startIndex: number,
	) {
		const pageKeys = script.page_keys.slice().sort((a, b) => a.order - b.order)
		const pages: PageItem[] = pageKeys.map((pk) => ({
			key: pk.s3_key,
			url: urls[pk.s3_key] ?? "",
			order: pk.order,
			mimeType: pk.mime_type,
			sourceFile: pk.source_file,
		}))
		const name = localNames[script.id] ?? script.proposed_name ?? ""
		setCarousel({ pages, index: startIndex, scriptName: name })
	}

	async function persistPageKeys(
		script: StagedScript,
	) {
		const r = await updateStagedScriptPageKeys(script.id, script.page_keys)
		if (!r.ok) toast.error(r.error)
	}

	async function handleDelete(scriptId: string) {
		const r = await deleteStagedScript(scriptId)
		if (!r.ok) {
			toast.error(r.error)
			return
		}
		setLocalScripts((prev) => prev.filter((s) => s.id !== scriptId))
		setLocalNames((prev) => {
			const next = { ...prev }
			delete next[scriptId]
			return next
		})
		onDeleteScript?.(scriptId)
	}

	return {
		localScripts,
		setLocalScripts,
		localNames,
		setLocalNames,
		urls,
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
