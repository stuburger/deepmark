import { AdminSidebarNav } from "@/components/admin-sidebar-nav"
import {
	Sidebar,
	SidebarFooter,
	SidebarHeader,
	SidebarInset,
	SidebarProvider,
	SidebarSeparator,
	SidebarTrigger,
} from "@/components/ui/sidebar"
import { auth } from "@/lib/auth"
import { Shield } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

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
					<Link
						href="/api/logout"
						className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
					>
						Logout
					</Link>
				</SidebarFooter>
			</Sidebar>
			<SidebarInset>
				<header className="flex h-14 items-center gap-4 border-b bg-background px-6 md:hidden">
					<SidebarTrigger />
					<Link
						href="/admin/overview"
						className="flex items-center gap-2 font-semibold"
					>
						<Shield className="h-5 w-5" />
						<span>Admin Space</span>
					</Link>
				</header>
				<main className="flex-1 overflow-auto p-6">{children}</main>
			</SidebarInset>
		</SidebarProvider>
	)
}
