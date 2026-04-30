"use client"

import type { StagedScript } from "@/lib/batch/types"
import { stagedScriptScanPageUrl } from "@/lib/scan-url"
import { useState } from "react"
import type { PageItem } from "../page-carousel"

export type CarouselState = {
	pages: PageItem[]
	index: number
	scriptName: string
}

// Shared hook for the page-carousel lightbox used in both the staging review
// list and the paper tray panel.  Callers supply the pre-computed name string
// so each context can apply its own display logic (localNames vs confirmed_name).

export function usePageCarousel() {
	const [carousel, setCarousel] = useState<CarouselState | null>(null)

	function openCarousel(
		batchId: string,
		script: StagedScript,
		startIndex: number,
		name: string,
	) {
		const pageKeys = script.page_keys.slice().sort((a, b) => a.order - b.order)

		const pages: PageItem[] = pageKeys.map((pk) => ({
			key: pk.s3_key,
			url: stagedScriptScanPageUrl(batchId, script.id, pk.order),
			order: pk.order,
			mimeType: pk.mime_type,
			sourceFile: pk.source_file,
		}))

		setCarousel({ pages, index: startIndex, scriptName: name })
	}

	return { carousel, setCarousel, openCarousel }
}
