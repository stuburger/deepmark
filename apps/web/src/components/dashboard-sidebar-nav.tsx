"use client"

import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
	BookOpen,
	FileText,
	GraduationCap,
	LayoutDashboard,
	PenLine,
	ScanLine,
	Upload,
	Users,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const navItems = [
	{ href: "/dashboard/mark", label: "Mark a Paper", icon: PenLine },
	{ href: "/dashboard", label: "Overview", icon: LayoutDashboard },
	{ href: "/dashboard/exam-papers", label: "Exam Papers", icon: FileText },
	{ href: "/dashboard/questions", label: "Questions", icon: BookOpen },
	{
		href: "/dashboard/exemplars",
		label: "Exemplar Answers",
		icon: GraduationCap,
	},
	{ href: "/dashboard/scans", label: "Scan Submissions", icon: ScanLine },
	{ href: "/dashboard/upload", label: "PDF Upload", icon: Upload },
	{ href: "/dashboard/users", label: "Users", icon: Users },
]

export function DashboardSidebarNav() {
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
