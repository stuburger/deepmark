import { AppNavbar } from "@/components/app-navbar"
import { PushRegistration } from "@/components/push-registration"
import { TeacherSidebarNav } from "@/components/teacher-sidebar-nav"
import { Button } from "@/components/ui/button"
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
import Image from "next/image"
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
						className="flex items-center px-2 py-2"
					>
						<Image
							src="/deepmark-logo-navbar.png"
							alt="DeepMark"
							width={92}
							height={40}
							className="h-10 w-auto"
							priority
						/>
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
						<Button
							type="submit"
							variant="ghost"
							size="sm"
							className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
						>
							Logout
						</Button>
					</form>
				</SidebarFooter>
			</Sidebar>
			<SidebarInset>
				<AppNavbar />
				<main className="flex-1 overflow-auto p-6">{children}</main>
			</SidebarInset>
			<PushRegistration />
		</SidebarProvider>
	)
}
