"use client"

import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar"
import { BookOpen, GraduationCap, LayoutDashboard } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const navItems = [
	{ href: "/admin/overview", label: "Overview", icon: LayoutDashboard },
	{ href: "/admin/questions", label: "Questions", icon: BookOpen },
	{ href: "/admin/exemplars", label: "Exemplar Answers", icon: GraduationCap },
]

export function AdminSidebarNav() {
	const pathname = usePathname()

	return (
		<SidebarContent>
			<SidebarGroup>
				<SidebarGroupContent>
					<SidebarMenu>
						{navItems.map(({ href, label, icon: Icon }) => (
							<SidebarMenuItem key={href}>
								<SidebarMenuButton
									render={
										<Link href={href}>
											<Icon />
											<span>{label}</span>
										</Link>
									}
									isActive={
										pathname === href || pathname.startsWith(`${href}/`)
									}
								/>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroupContent>
			</SidebarGroup>
		</SidebarContent>
	)
}
