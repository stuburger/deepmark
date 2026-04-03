"use client"

import {
	deleteStagedScript,
	updateStagedScriptPageKeys,
} from "@/lib/batch/mutations"
import { getStagedScriptPageUrls } from "@/lib/batch/queries"
import type { BatchIngestJobData } from "@/lib/batch/types"
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
	batchId: string,
	scripts: BatchIngestJobData["staged_scripts"],
	onDeleteScript?: (scriptId: string) => void,
) {
	const [localScripts, setLocalScripts] = useState(scripts)
	const [localNames, setLocalNames] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			scripts.map((s) => [s.id, s.confirmed_name ?? s.proposed_name ?? ""]),
		),
	)
	const [urls, setUrls] = useState<Record<string, string>>({})
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

	// Load presigned GET URLs for all pages in the batch once
	useEffect(() => {
		getStagedScriptPageUrls(batchId).then((r) => {
			if (r.ok) setUrls(r.urls)
		})
	}, [batchId])

	function openCarousel(
		script: BatchIngestJobData["staged_scripts"][number],
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
		script: BatchIngestJobData["staged_scripts"][number],
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
