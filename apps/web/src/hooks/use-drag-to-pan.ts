import { useCallback, useEffect, useRef } from "react"

/**
 * Attach to a scrollable container to enable click-and-drag panning.
 * Returns a ref to apply to the container and an onMouseDown handler.
 *
 * The cursor automatically switches to `grab` / `grabbing` while panning.
 * Pass `enabled = false` to disable (e.g. when zoom === 1 and there is nothing to pan).
 */
export function useDragToPan<T extends HTMLElement>(enabled = true) {
	const ref = useRef<T>(null)
	const dragging = useRef(false)
	const origin = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

	const onMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (!enabled || !ref.current) return
			// Only pan on primary button; let clicks on child buttons through
			if (e.button !== 0) return
			dragging.current = true
			origin.current = {
				x: e.clientX,
				y: e.clientY,
				scrollLeft: ref.current.scrollLeft,
				scrollTop: ref.current.scrollTop,
			}
			ref.current.style.cursor = "grabbing"
			ref.current.style.userSelect = "none"
		},
		[enabled],
	)

	useEffect(() => {
		const el = ref.current
		if (!el) return

		function onMouseMove(e: MouseEvent) {
			if (!dragging.current || !el) return
			const dx = e.clientX - origin.current.x
			const dy = e.clientY - origin.current.y
			el.scrollLeft = origin.current.scrollLeft - dx
			el.scrollTop = origin.current.scrollTop - dy
		}

		function onMouseUp() {
			if (!dragging.current) return
			dragging.current = false
			if (el) {
				el.style.cursor = ""
				el.style.userSelect = ""
			}
		}

		window.addEventListener("mousemove", onMouseMove)
		window.addEventListener("mouseup", onMouseUp)
		return () => {
			window.removeEventListener("mousemove", onMouseMove)
			window.removeEventListener("mouseup", onMouseUp)
		}
	}, [])

	const cursorClass = enabled ? "cursor-grab active:cursor-grabbing" : ""

	return { ref, onMouseDown, cursorClass }
}
