"use client"

import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useEffect } from "react"
import { createPortal } from "react-dom"

// ─── Types ────────────────────────────────────────────────────────────────────

export type PageItem = {
	key: string
	url: string
	order: number
	mimeType: string
	sourceFile: string
}

// ─── Page carousel (3-up viewer) ──────────────────────────────────────────────

export function PageCarousel({
	pages,
	index,
	scriptName,
	onClose,
	onNavigate,
}: {
	pages: PageItem[]
	index: number
	scriptName: string
	onClose: () => void
	onNavigate: (index: number) => void
}) {
	const current = pages[index]
	const prev = index > 0 ? pages[index - 1] : null
	const next = index < pages.length - 1 ? pages[index + 1] : null

	// Keyboard navigation — capture phase ensures we intercept Escape before
	// the parent Radix Dialog's bubble-phase handler closes both dialogs.
	useEffect(() => {
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				e.stopPropagation()
				onClose()
				return
			}
			if ((e.key === "ArrowRight" || e.key === "ArrowUp") && next) {
				onNavigate(index + 1)
				return
			}
			if ((e.key === "ArrowLeft" || e.key === "ArrowDown") && prev) {
				onNavigate(index - 1)
			}
		}
		window.addEventListener("keydown", handleKey, { capture: true })
		return () =>
			window.removeEventListener("keydown", handleKey, { capture: true })
	}, [index, prev, next, onClose, onNavigate])

	if (!current) return null

	return createPortal(
		<div className="fixed inset-0 z-50 flex flex-col bg-black/92 backdrop-blur-sm">
			{/* ── Top bar ── */}
			<div className="flex items-center justify-between px-6 py-4 shrink-0">
				<div className="text-sm text-white/60">
					<span className="font-medium text-white">
						{scriptName || "Unnamed script"}
					</span>
					<span className="mx-2 text-white/30">·</span>
					Page {index + 1} of {pages.length}
				</div>
				<button
					type="button"
					onClick={onClose}
					className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
					aria-label="Close"
				>
					<X className="h-5 w-5" />
				</button>
			</div>

			{/* ── 3-up image strip ── */}
			<div className="flex-1 flex items-center justify-center gap-4 px-8 min-h-0">
				{/* Prev */}
				<div className="w-[22%] flex items-center justify-center">
					{prev ? (
						<button
							type="button"
							onClick={() => onNavigate(index - 1)}
							className="group relative w-full flex items-center justify-center focus-visible:outline-none"
							title="Previous page"
						>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={prev.url}
								alt={`Page ${index}`}
								draggable={false}
								className="max-h-[72vh] w-full object-contain rounded-lg shadow-lg opacity-40 group-hover:opacity-65 transition-opacity duration-200 scale-95 group-hover:scale-100"
							/>
							<div className="absolute inset-0 flex items-center justify-start pl-2 opacity-0 group-hover:opacity-100 transition-opacity">
								<div className="p-2 rounded-full bg-black/60 text-white">
									<ChevronLeft className="h-5 w-5" />
								</div>
							</div>
						</button>
					) : (
						<div className="w-full" />
					)}
				</div>

				{/* Current — center, full size */}
				<div className="w-[56%] flex items-center justify-center">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={current.url}
						alt={`Page ${index + 1}`}
						draggable={false}
						className="max-h-[80vh] w-full object-contain rounded-xl shadow-2xl ring-1 ring-white/10"
					/>
				</div>

				{/* Next */}
				<div className="w-[22%] flex items-center justify-center">
					{next ? (
						<button
							type="button"
							onClick={() => onNavigate(index + 1)}
							className="group relative w-full flex items-center justify-center focus-visible:outline-none"
							title="Next page"
						>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={next.url}
								alt={`Page ${index + 2}`}
								draggable={false}
								className="max-h-[72vh] w-full object-contain rounded-lg shadow-lg opacity-40 group-hover:opacity-65 transition-opacity duration-200 scale-95 group-hover:scale-100"
							/>
							<div className="absolute inset-0 flex items-center justify-end pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
								<div className="p-2 rounded-full bg-black/60 text-white">
									<ChevronRight className="h-5 w-5" />
								</div>
							</div>
						</button>
					) : (
						<div className="w-full" />
					)}
				</div>
			</div>

			{/* ── Bottom: dot nav + keyboard hint ── */}
			<div className="shrink-0 flex flex-col items-center gap-2 py-5">
				{pages.length > 1 && (
					<div className="flex items-center gap-1.5">
						{pages.map((_, i) => (
							<button
								// biome-ignore lint/suspicious/noArrayIndexKey: static page dot indicators
								key={i}
								type="button"
								onClick={() => onNavigate(i)}
								aria-label={`Go to page ${i + 1}`}
								className={`rounded-full transition-all duration-200 ${
									i === index
										? "w-5 h-2 bg-white"
										: "w-2 h-2 bg-white/30 hover:bg-white/60"
								}`}
							/>
						))}
					</div>
				)}
				<p className="text-xs text-white/25 select-none">
					← ↓ prev · → ↑ next · Esc to close
				</p>
			</div>
		</div>,
		document.body,
	)
}
