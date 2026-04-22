"use client"

import { PAGE_THUMB_H, PAGE_THUMB_W } from "./exam-paper-helpers"

// ─── Constants ────────────────────────────────────────────────────────────────

const ZOOM = 5
const PANEL_W = PAGE_THUMB_W * 1.4 // 280px
const PANEL_H = PAGE_THUMB_H * 1.4 // ~396px — A4 aspect ratio

const SCALED_W = PAGE_THUMB_W * ZOOM // 1000px
const SCALED_H = PAGE_THUMB_H * ZOOM // 1415px

// Fixed position inside the staging dialog's top-right corner.
// The dialog sits at inset-4 (16px), its header is ~72px, toolbar ~44px.
// right: 24px  → flush inside the dialog's right edge (16px inset + 8px gap)
// top:  140px  → clears the header and toolbar
const FIXED_RIGHT = 24
const FIXED_TOP = 140

// ─── Types ────────────────────────────────────────────────────────────────────

export type MagnifierAnchor = {
	/** Cursor position as percentage (0–100) within the thumbnail */
	xPct: number
	yPct: number
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PageMagnifier({
	url,
	anchor,
}: {
	url: string
	anchor: MagnifierAnchor
}) {
	const { xPct, yPct } = anchor

	// Translate cursor percentage to pixel offset in the original image size,
	// then compute the negative margin that centres the zoomed view on that point.
	const imgX = (xPct / 100) * PAGE_THUMB_W
	const imgY = (yPct / 100) * PAGE_THUMB_H

	const marginLeft = Math.min(
		0,
		Math.max(-(imgX * ZOOM - PANEL_W / 2), -(SCALED_W - PANEL_W)),
	)
	const marginTop = Math.min(
		0,
		Math.max(-(imgY * ZOOM - PANEL_H / 2), -(SCALED_H - PANEL_H)),
	)

	return (
		<div
			className="fixed z-9999 pointer-events-none rounded-lg border border-border/60 shadow-2xl overflow-hidden ring-1 ring-black/5 bg-background"
			style={{
				right: FIXED_RIGHT,
				top: FIXED_TOP,
				width: PANEL_W,
				height: PANEL_H,
			}}
		>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={url}
				alt=""
				draggable={false}
				style={{
					width: SCALED_W,
					height: SCALED_H,
					maxWidth: "none",
					marginLeft,
					marginTop,
					display: "block",
				}}
			/>
		</div>
	)
}
