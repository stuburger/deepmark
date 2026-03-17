import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { DashboardSidebarNav } from "@/components/dashboard-sidebar-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 font-semibold text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>DeepMark</span>
          </Link>
        </SidebarHeader>
        <DashboardSidebarNav />
        <SidebarFooter>
          <SidebarSeparator />
          <Link
            href="/"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            ← Back to home
          </Link>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-background px-6 md:hidden">
          <SidebarTrigger />
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold"
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>DeepMark</span>
          </Link>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
