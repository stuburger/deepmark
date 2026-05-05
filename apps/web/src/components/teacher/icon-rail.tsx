"use client"

import {
	BarChart3,
	ClipboardList,
	Clock,
	FileText,
	LayoutDashboard,
	Menu,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

import { useTeacherNav } from "./teacher-nav-context"

type IconRailProps = {
	initials: string
	avatarUrl: string | null
}

const NAV_ICONS = [
	{ href: "/teacher", label: "Dashboard", Icon: LayoutDashboard, exact: true },
	{ href: "/teacher/mark", label: "Recent marking", Icon: Clock, exact: false },
	{
		href: "/teacher/exam-papers",
		label: "Exam papers",
		Icon: ClipboardList,
		exact: false,
	},
	{
		href: "/teacher/analytics",
		label: "Analytics",
		Icon: BarChart3,
		exact: false,
	},
	{
		href: "/teacher/reports",
		label: "Reports",
		Icon: FileText,
		exact: false,
	},
] as const

export function IconRail({ initials, avatarUrl }: IconRailProps) {
	const pathname = usePathname()
	const { open, setOpen } = useTeacherNav()

	return (
		<aside
			className={cn(
				"icon-rail flex h-full w-20 flex-col items-center border-r border-dotted border-border-quiet py-5",
				"transition-[filter] duration-300",
			)}
		>
			<div className="flex flex-col items-center">
				<button
					type="button"
					onClick={() => setOpen(!open)}
					aria-label="Open menu"
					className="flex size-10 items-center justify-center rounded-md text-ink-tertiary transition-colors hover:bg-primary/15 hover:text-primary"
				>
					<Menu className="size-[18px]" strokeWidth={1.2} />
				</button>

				{NAV_ICONS.map(({ href, label, Icon, exact }) => {
					const isActive = exact
						? pathname === href
						: pathname === href || pathname.startsWith(`${href}/`)
					return (
						<Link
							key={href}
							href={href}
							aria-label={label}
							className={cn(
								"flex size-10 items-center justify-center rounded-md transition-colors",
								isActive
									? "bg-primary/15 text-primary"
									: "text-ink-tertiary hover:bg-primary/15 hover:text-primary",
							)}
						>
							<Icon className="size-[18px]" strokeWidth={1.2} />
						</Link>
					)
				})}
			</div>

			<Link
				href="/teacher/settings"
				aria-label="Account"
				className="mt-auto mb-3 flex size-10 items-center justify-center overflow-hidden rounded-full bg-ink-secondary font-mono text-[12px] font-semibold text-paper-white transition-all hover:scale-105 hover:bg-primary"
			>
				{avatarUrl ? (
					// biome-ignore lint/performance/noImgElement: Google avatar host isn't in next/image remotePatterns.
					<img
						src={avatarUrl}
						alt=""
						referrerPolicy="no-referrer"
						className="size-full object-cover"
					/>
				) : (
					initials
				)}
			</Link>
		</aside>
	)
}
