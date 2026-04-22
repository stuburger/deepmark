"use client"

import { PAGE_THUMB_H, PAGE_THUMB_W } from "./exam-paper-helpers"

// ─── Constants ────────────────────────────────────────────────────────────────

const ZOOM = 5
const PANEL_W = PAGE_THUMB_W * 1.4 // 280px — wider than the thumbnail for comfortable viewing
const PANEL_H = PAGE_THUMB_H * 1.4 // ~396px — maintains A4 aspect
const SCALED_W = PAGE_THUMB_W * ZOOM // 500px — zoomed image width
const SCALED_H = PAGE_THUMB_H * ZOOM // 707px — zoomed image height
const GAP = 10 // gap between thumbnail and panel (px)

// ─── Types ────────────────────────────────────────────────────────────────────

export type MagnifierAnchor = {
	/** Cursor position as percentage (0–100) within the thumbnail */
	xPct: number
	yPct: number
	/** Bounding rect of the thumbnail element */
	rect: DOMRect
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PageMagnifier({
	url,
	anchor,
}: {
	url: string
	anchor: MagnifierAnchor
}) {
	const { xPct, yPct, rect } = anchor

	// Translate percentage cursor position to pixel offset in the original image
	const imgX = (xPct / 100) * PAGE_THUMB_W
	const imgY = (yPct / 100) * PAGE_THUMB_H

	// Negative margin to centre the zoomed image on the cursor point,
	// clamped so the image never scrolls beyond its edges inside the panel.
	const marginLeft = Math.min(
		0,
		Math.max(-(imgX * ZOOM - PANEL_W / 2), -(SCALED_W - PANEL_W)),
	)
	const marginTop = Math.min(
		0,
		Math.max(-(imgY * ZOOM - PANEL_H / 2), -(SCALED_H - PANEL_H)),
	)

	// Prefer right-of-thumbnail; flip left if it would clip the viewport
	const spaceRight = window.innerWidth - rect.right
	const showLeft = spaceRight < PANEL_W + GAP
	const left = showLeft ? rect.left - PANEL_W - GAP : rect.right + GAP

	// Clamp top so the panel doesn't fall below the viewport
	const top = Math.min(rect.top, window.innerHeight - PANEL_H - 8)

	return (
		<div
			className="fixed z-9999 pointer-events-none rounded-lg border border-border/60 shadow-2xl overflow-hidden ring-1 ring-black/5"
			style={{
				left,
				top,
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
					marginLeft,
					marginTop,
					display: "block",
					imageRendering: "auto",
				}}
			/>
		</div>
	)
}
