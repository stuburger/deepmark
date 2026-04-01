"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2 } from "lucide-react"

type Props = {
	description: string
	points: string
	index: number
	disabled: boolean
	isOnly: boolean
	onChange: (field: "description" | "points", value: string) => void
	onRemove: () => void
}

export function MarkPointRow({
	description,
	points,
	index,
	disabled,
	isOnly,
	onChange,
	onRemove,
}: Props) {
	return (
		<div className="flex items-center gap-2">
			<Input
				value={description}
				onChange={(e) => onChange("description", e.target.value)}
				disabled={disabled}
				placeholder={`Mark point ${index + 1}`}
				className="flex-1 text-sm"
			/>
			<Input
				type="number"
				min={0}
				value={points}
				onChange={(e) => onChange("points", e.target.value)}
				disabled={disabled}
				className="w-16 text-sm"
				aria-label="Points"
			/>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				onClick={onRemove}
				disabled={disabled || isOnly}
				className="shrink-0 text-muted-foreground hover:text-destructive"
			>
				<Trash2 className="h-4 w-4" />
			</Button>
		</div>
	)
}
