import {
	BarChart3,
	ClipboardList,
	Clock,
	HelpCircle,
	LayoutDashboard,
	Settings,
	Users,
} from "lucide-react"
import type { ComponentType, SVGProps } from "react"

export type TeacherNavItem = {
	href: string
	label: string
	/** Optional shorter label for the icon rail's aria-label / tooltip. Falls back to `label`. */
	shortLabel?: string
	Icon: ComponentType<SVGProps<SVGSVGElement>>
	exact?: boolean
}

export type TeacherNavSection = {
	/** Stable id used by render code to inject special elements (e.g. the bookmarked list after `recent`). */
	id: "primary" | "recent" | "all" | "insight" | "tools"
	/** When set, the sheet renders a section heading above the items. */
	label?: string
	/** Whether the icon rail surfaces these items (the rail is a curated subset of the sheet). */
	showOnRail: boolean
	items: TeacherNavItem[]
}

export const TEACHER_NAV_SECTIONS: TeacherNavSection[] = [
	{
		id: "primary",
		showOnRail: true,
		items: [
			{
				href: "/teacher",
				label: "Dashboard",
				Icon: LayoutDashboard,
				exact: true,
			},
		],
	},
	{
		id: "recent",
		showOnRail: true,
		items: [{ href: "/teacher/mark", label: "Recent marking", Icon: Clock }],
	},
	{
		id: "all",
		showOnRail: true,
		items: [
			{
				href: "/teacher/exam-papers",
				label: "All papers",
				shortLabel: "Exam papers",
				Icon: ClipboardList,
			},
			{
				href: "/teacher/students",
				label: "All students",
				shortLabel: "Students",
				Icon: Users,
			},
		],
	},
	{
		id: "insight",
		label: "Insight",
		showOnRail: true,
		items: [
			{ href: "/teacher/analytics", label: "Analytics", Icon: BarChart3 },
		],
	},
	{
		id: "tools",
		label: "Tools",
		showOnRail: false,
		items: [{ href: "/teacher/help", label: "Help", Icon: HelpCircle }],
	},
]

export const TEACHER_NAV_FOOTER_ITEMS: TeacherNavItem[] = [
	{ href: "/teacher/settings", label: "Settings", Icon: Settings },
]

/** Flat list of items the icon rail surfaces, derived from sections. */
export const TEACHER_RAIL_ITEMS: TeacherNavItem[] = TEACHER_NAV_SECTIONS.filter(
	(s) => s.showOnRail,
).flatMap((s) => s.items)
