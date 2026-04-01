"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Trash2 } from "lucide-react"

type LevelRow = {
	level: string
	minMark: string
	maxMark: string
	descriptor: string
	aoRequirementsText: string
}

type Props = {
	row: LevelRow
	index: number
	disabled: boolean
	isOnly: boolean
	onChange: (key: keyof LevelRow, value: string) => void
	onRemove: () => void
}

export function LevelBlock({
	row,
	index,
	disabled,
	isOnly,
	onChange,
	onRemove,
}: Props) {
	return (
		<div className="rounded-md border p-3 space-y-3">
			<div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
				<Input
					type="number"
					min={1}
					value={row.level}
					onChange={(e) => onChange("level", e.target.value)}
					disabled={disabled}
					placeholder="Level"
				/>
				<Input
					type="number"
					min={0}
					value={row.minMark}
					onChange={(e) => onChange("minMark", e.target.value)}
					disabled={disabled}
					placeholder="Min mark"
				/>
				<Input
					type="number"
					min={0}
					value={row.maxMark}
					onChange={(e) => onChange("maxMark", e.target.value)}
					disabled={disabled}
					placeholder="Max mark"
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={onRemove}
					disabled={disabled || isOnly}
					className="text-muted-foreground hover:text-destructive"
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>
			<Textarea
				value={row.descriptor}
				onChange={(e) => onChange("descriptor", e.target.value)}
				disabled={disabled}
				rows={3}
				placeholder="Level descriptor"
				className="resize-y text-sm"
			/>
			<Textarea
				value={row.aoRequirementsText}
				onChange={(e) => onChange("aoRequirementsText", e.target.value)}
				disabled={disabled}
				rows={2}
				placeholder="AO requirements (one per line, optional)"
				className="resize-y text-sm"
			/>
		</div>
	)
}
