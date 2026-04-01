"use client"

import { LayoutGrid, List } from "lucide-react"

export function ViewToggle({
	value,
	onChange,
}: { value: "grid" | "table"; onChange: (v: "grid" | "table") => void }) {
	return (
		<div className="flex items-center gap-0.5 rounded-md border p-0.5">
			<button
				type="button"
				onClick={() => onChange("grid")}
				className={`rounded p-1 transition-colors ${
					value === "grid"
						? "bg-muted text-foreground"
						: "text-muted-foreground hover:text-foreground"
				}`}
				aria-label="Grid view"
			>
				<LayoutGrid className="h-4 w-4" />
			</button>
			<button
				type="button"
				onClick={() => onChange("table")}
				className={`rounded p-1 transition-colors ${
					value === "table"
						? "bg-muted text-foreground"
						: "text-muted-foreground hover:text-foreground"
				}`}
				aria-label="Table view"
			>
				<List className="h-4 w-4" />
			</button>
		</div>
	)
}
