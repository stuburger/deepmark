import { AppNavbar } from "@/components/app-navbar"
import { TeacherSidebarNav } from "@/components/teacher-sidebar-nav"
import {
	Sidebar,
	SidebarFooter,
	SidebarHeader,
	SidebarInset,
	SidebarProvider,
	SidebarSeparator,
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
						href="/teacher/exam-papers"
						className="flex items-center gap-2 rounded-md px-2 py-1.5 font-semibold text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
					>
						<GraduationCap className="h-5 w-5" />
						<span>DeepMark</span>
					</Link>
				</SidebarHeader>
				<TeacherSidebarNav />
				<SidebarFooter>
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
				<AppNavbar
					icon={<GraduationCap className="h-4 w-4 shrink-0" />}
					title="DeepMark"
				/>
				<main className="flex-1 overflow-auto p-6">{children}</main>
			</SidebarInset>
		</SidebarProvider>
	)
}
