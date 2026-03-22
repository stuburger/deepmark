import { TeacherSidebarNav } from "@/components/teacher-sidebar-nav"
import { ThemeToggle } from "@/components/theme-toggle"
import {
	Sidebar,
	SidebarFooter,
	SidebarHeader,
	SidebarInset,
	SidebarProvider,
	SidebarSeparator,
	SidebarTrigger,
} from "@/components/ui/sidebar"
import { logout } from "@/lib/actions"
import { auth } from "@/lib/auth"
import { GraduationCap } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

export default async function TeacherLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const session = await auth()

	if (!session) {
		redirect("/login")
	}

	return (
		<SidebarProvider>
			<Sidebar>
				<SidebarHeader>
					<Link
						href="/teacher/mark"
						className="flex items-center gap-2 rounded-md px-2 py-1.5 font-semibold text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
					>
						<GraduationCap className="h-5 w-5" />
						<span>Teacher Space</span>
					</Link>
				</SidebarHeader>
				<TeacherSidebarNav />
				<SidebarFooter>
					<div className="flex justify-end">
						<ThemeToggle className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent" />
					</div>
					<SidebarSeparator />
					<Link
						href="/admin/overview"
						className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
					>
						Switch to admin
					</Link>
					<form action={logout}>
						<button
							type="submit"
							className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
						>
							Logout
						</button>
					</form>
				</SidebarFooter>
			</Sidebar>
			<SidebarInset>
				<header className="flex h-14 items-center gap-4 border-b bg-background px-6 md:hidden">
					<SidebarTrigger />
					<Link
						href="/teacher/mark"
						className="flex min-w-0 flex-1 items-center gap-2 font-semibold"
					>
						<GraduationCap className="h-5 w-5 shrink-0" />
						<span className="truncate">Teacher Space</span>
					</Link>
					<ThemeToggle className="shrink-0" />
				</header>
				<main className="flex-1 overflow-auto p-6">{children}</main>
			</SidebarInset>
		</SidebarProvider>
	)
}
