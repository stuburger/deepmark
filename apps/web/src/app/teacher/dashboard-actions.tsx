"use client"

import { BarChart3, Play, Plus } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"

// Right-hand action stack on the dashboard. Three buttons: primary CTA opens
// the upload-and-go wizard; secondary buttons navigate. Per Geoff's v2: all
// three are left-aligned (justify-start), and Analytics replaces the old "Talk
// to DeepMark" entry — the chat now lives behind the central Ask Anything pill.
export function DashboardActions() {
	return (
		<div className="flex min-w-[220px] flex-col gap-2 pt-2">
			<Button
				variant="default"
				size="lg"
				className="w-full justify-start"
				nativeButton={false}
				render={<Link href="/teacher/papers/new" />}
			>
				<Plus className="size-3.5" />
				Mark new paper
			</Button>
			<Button
				variant="secondary"
				className="w-full justify-start"
				nativeButton={false}
				render={<Link href="/teacher/mark" />}
			>
				<Play className="size-3.5 fill-current" />
				Resume marking
			</Button>
			<Button
				variant="secondary"
				className="w-full justify-start"
				nativeButton={false}
				render={<Link href="/teacher/analytics" />}
			>
				<BarChart3 className="size-3.5" />
				Analytics
			</Button>
		</div>
	)
}
