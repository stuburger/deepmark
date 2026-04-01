"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2 } from "lucide-react"

type CapRow = {
	condition: string
	maxLevel: string
	maxMark: string
	reason: string
}

type Props = {
	cap: CapRow
	index: number
	disabled: boolean
	onChange: (key: keyof CapRow, value: string) => void
	onRemove: () => void
}

export function CapBlock({ cap, index, disabled, onChange, onRemove }: Props) {
	return (
		<div className="rounded-md border p-3 space-y-2">
			<Input
				value={cap.condition}
				onChange={(e) => onChange("condition", e.target.value)}
				disabled={disabled}
				placeholder="Condition"
			/>
			<div className="grid grid-cols-2 gap-2">
				<Input
					type="number"
					min={1}
					value={cap.maxLevel}
					onChange={(e) => onChange("maxLevel", e.target.value)}
					disabled={disabled}
					placeholder="Max level (or leave blank)"
				/>
				<Input
					type="number"
					min={0}
					value={cap.maxMark}
					onChange={(e) => onChange("maxMark", e.target.value)}
					disabled={disabled}
					placeholder="Max mark (or leave blank)"
				/>
			</div>
			<Input
				value={cap.reason}
				onChange={(e) => onChange("reason", e.target.value)}
				disabled={disabled}
				placeholder="Reason"
			/>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={onRemove}
				disabled={disabled}
				className="text-muted-foreground hover:text-destructive"
			>
				<Trash2 className="h-4 w-4 mr-1.5" />
				Remove cap
			</Button>
		</div>
	)
}
