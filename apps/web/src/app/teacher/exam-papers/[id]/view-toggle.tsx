"use client"

import { LayoutGrid, Rows3, Table2 } from "lucide-react"
import type { ReactNode } from "react"

type ViewOption = {
	value: string
	icon: ReactNode
	label: string
}

const ICONS: Record<string, ReactNode> = {
	grid: <LayoutGrid className="h-4 w-4" />,
	table: <Table2 className="h-4 w-4" />,
	list: <Rows3 className="h-4 w-4" />,
}

export function ViewToggle<T extends string>({
	value,
	onChange,
	options,
}: {
	value: T
	onChange: (v: T) => void
	options?: ViewOption[]
}) {
	const items: ViewOption[] = options ?? [
		{ value: "list", icon: ICONS.list, label: "List view" },
		{ value: "table", icon: ICONS.table, label: "Table view" },
	]

	return (
		<div className="flex items-center gap-0.5 rounded-md border p-0.5">
			{items.map((opt) => (
				<button
					key={opt.value}
					type="button"
					onClick={() => onChange(opt.value as T)}
					className={`rounded p-1 transition-colors ${
						value === opt.value
							? "bg-muted text-foreground"
							: "text-muted-foreground hover:text-foreground"
					}`}
					aria-label={opt.label}
				>
					{opt.icon ?? ICONS[opt.value]}
				</button>
			))}
		</div>
	)
}
