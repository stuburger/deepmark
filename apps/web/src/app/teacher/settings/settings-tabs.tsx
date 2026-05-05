"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

type Tab = { href: string; label: string; exact?: boolean }

const TABS: readonly Tab[] = [
	{ href: "/teacher/settings", label: "Profile", exact: true },
	{ href: "/teacher/settings/billing", label: "Billing" },
	{ href: "/teacher/settings/usage", label: "Usage" },
]

export function SettingsTabs() {
	const pathname = usePathname()

	return (
		<nav className="border-b border-border-quiet">
			<div className="mx-auto flex max-w-2xl gap-6 px-2">
				{TABS.map(({ href, label, exact }) => {
					const isActive = exact
						? pathname === href
						: pathname === href || pathname.startsWith(`${href}/`)
					return (
						<Link
							key={href}
							href={href}
							className={cn(
								"-mb-px border-b-2 py-3 text-[14px] font-medium transition-colors",
								isActive
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
						>
							{label}
						</Link>
					)
				})}
			</div>
		</nav>
	)
}
