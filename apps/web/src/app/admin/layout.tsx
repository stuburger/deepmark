import { AdminSidebarNav } from "@/components/admin-sidebar-nav"
import { AppNavbar } from "@/components/app-navbar"
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
import { Shield } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

async function logoutFormAction() {
	"use server"
	await logout()
}

export default async function AdminLayout({
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
						href="/admin/overview"
						className="flex items-center gap-2 rounded-md px-2 py-1.5 font-semibold text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
					>
						<Shield className="h-5 w-5" />
						<span>Admin Space</span>
					</Link>
				</SidebarHeader>
				<AdminSidebarNav />
				<SidebarFooter>
					<SidebarSeparator />
					<Link
						href="/teacher/mark"
						className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
					>
						Switch to teacher
					</Link>
					<form action={logoutFormAction}>
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
				<AppNavbar
					icon={<Shield className="h-4 w-4 shrink-0" />}
					title="Admin Space"
				/>
				<main className="flex-1 overflow-auto p-6">{children}</main>
			</SidebarInset>
		</SidebarProvider>
	)
}
