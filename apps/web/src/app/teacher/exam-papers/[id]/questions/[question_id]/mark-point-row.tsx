"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2 } from "lucide-react"

type Props = {
	criteria: string
	description: string
	points: string
	index: number
	disabled: boolean
	isOnly: boolean
	onChange: (
		field: "criteria" | "description" | "points",
		value: string,
	) => void
	onRemove: () => void
}

export function MarkPointRow({
	criteria,
	description,
	points,
	index,
	disabled,
	isOnly,
	onChange,
	onRemove,
}: Props) {
	return (
		<div className="flex flex-col gap-1.5 rounded-md border border-input/60 p-2">
			<div className="flex items-center gap-2">
				<Input
					value={criteria}
					onChange={(e) => onChange("criteria", e.target.value)}
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
			<Input
				value={description}
				onChange={(e) => onChange("description", e.target.value)}
				disabled={disabled}
				placeholder="Description (optional) — e.g. AO code, category, marker note"
				className="h-7 border-transparent bg-muted/30 text-xs text-muted-foreground placeholder:text-muted-foreground/60 focus-visible:border-input focus-visible:bg-background focus-visible:text-foreground"
			/>
		</div>
	)
}
