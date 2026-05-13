"use client"

import { LogOut, Menu, Search, Shield, User } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { logoutFormAction } from "@/lib/actions"
import { cn } from "@/lib/utils"

import { TEACHER_RAIL_ITEMS } from "./teacher-nav-config"
import { useTeacherNav } from "./teacher-nav-context"

type IconRailProps = {
	initials: string
	avatarUrl: string | null
	isAdmin: boolean
}

export function IconRail({ initials, avatarUrl, isAdmin }: IconRailProps) {
	const pathname = usePathname()
	const { open, setOpen, setPaletteOpen } = useTeacherNav()

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

				<button
					type="button"
					onClick={() => setPaletteOpen(true)}
					aria-label="Search (⌘K)"
					title="Search (⌘K)"
					className="flex size-10 items-center justify-center rounded-md text-ink-tertiary transition-colors hover:bg-primary/15 hover:text-primary"
				>
					<Search className="size-[18px]" strokeWidth={1.2} />
				</button>

				{TEACHER_RAIL_ITEMS.map(({ href, label, shortLabel, Icon, exact }) => {
					const isActive = exact
						? pathname === href
						: pathname === href || pathname.startsWith(`${href}/`)
					return (
						<Link
							key={href}
							href={href}
							aria-label={shortLabel ?? label}
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

			<DropdownMenu>
				<DropdownMenuTrigger
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
				</DropdownMenuTrigger>
				<DropdownMenuContent side="right" align="end" sideOffset={12}>
					<DropdownMenuItem render={<Link href="/teacher/settings" />}>
						<User />
						Profile
					</DropdownMenuItem>
					{isAdmin && (
						<DropdownMenuItem render={<Link href="/admin/overview" />}>
							<Shield />
							Admin space
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						variant="destructive"
						onClick={() => logoutFormAction()}
					>
						<LogOut />
						Log out
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</aside>
	)
}
