import { useCallback, useState } from "react"

export type ScanViewSettings = {
	showOcr: boolean
	showRegions: boolean
	showMarks: boolean
	showChains: boolean
	showZoomControls: boolean
	viewMode: "focus" | "inspect"
}

export const DEFAULT_SCAN_VIEW_SETTINGS: ScanViewSettings = {
	showOcr: false,
	showRegions: true,
	showMarks: false,
	showChains: false,
	showZoomControls: false,
	viewMode: "focus",
}

export type ScanViewToggle = (key: keyof ScanViewSettings) => void
export type ScanViewSet = (updates: Partial<ScanViewSettings>) => void

export function useScanViewSettings(initial?: Partial<ScanViewSettings>) {
	const [settings, setSettings] = useState<ScanViewSettings>({
		...DEFAULT_SCAN_VIEW_SETTINGS,
		...initial,
	})

	const toggle = useCallback<ScanViewToggle>((key) => {
		setSettings((s) => {
			if (key === "viewMode") {
				return { ...s, viewMode: s.viewMode === "focus" ? "inspect" : "focus" }
			}
			return { ...s, [key]: !s[key] }
		})
	}, [])

	const set = useCallback<ScanViewSet>((updates) => {
		setSettings((s) => ({ ...s, ...updates }))
	}, [])

	return { settings, toggle, set }
}
