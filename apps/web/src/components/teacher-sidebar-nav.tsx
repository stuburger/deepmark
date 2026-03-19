"use client"

import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar"
import { FileText, PenLine } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const navItems = [
	{ href: "/teacher/mark", label: "Mark Papers", icon: PenLine },
	{ href: "/teacher/exam-papers", label: "Exam Papers", icon: FileText },
]

export function TeacherSidebarNav() {
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
