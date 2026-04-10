"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Pencil, Plus, RotateCcw, X } from "lucide-react"
import { useState } from "react"

export function WwwEbiOverrideEditor({
	aiItems,
	overrideItems,
	label,
	variant,
	onSave,
	onReset,
}: {
	aiItems: string[]
	overrideItems: string[] | null
	label: string
	variant: "www" | "ebi"
	onSave: (items: string[]) => void
	onReset: () => void
}) {
	const [editing, setEditing] = useState(false)
	const effectiveItems = overrideItems ?? aiItems
	const isOverridden = overrideItems !== null

	if (effectiveItems.length === 0 && !editing) return null

	const labelColor =
		variant === "www"
			? "text-green-600 dark:text-green-400"
			: "text-amber-600 dark:text-amber-400"
	const bulletColor = variant === "www" ? "text-green-500" : "text-amber-500"
	const bulletChar = variant === "www" ? "\u2713" : "\u2192"

	if (editing) {
		return (
			<BulletEditForm
				initial={effectiveItems}
				label={label}
				labelColor={labelColor}
				onSave={(items) => {
					onSave(items.filter((i) => i.trim()))
					setEditing(false)
				}}
				onCancel={() => setEditing(false)}
			/>
		)
	}

	return (
		<div className="group/bullets">
			<div className="flex items-center gap-1">
				<p
					className={cn(
						"text-[10px] font-semibold uppercase tracking-wide mb-0.5",
						labelColor,
					)}
				>
					{label}
				</p>
				{isOverridden && (
					<span className="text-[9px] font-medium text-blue-500 mb-0.5">
						Edited
					</span>
				)}
				<div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/bullets:opacity-100 transition-opacity">
					<button
						type="button"
						onClick={() => setEditing(true)}
						className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-all"
						title={`Edit ${label.toLowerCase()}`}
					>
						<Pencil className="h-2.5 w-2.5" />
					</button>
					{isOverridden && (
						<button
							type="button"
							onClick={onReset}
							className="rounded p-0.5 text-muted-foreground hover:text-destructive transition-all"
							title="Reset to AI"
						>
							<RotateCcw className="h-2.5 w-2.5" />
						</button>
					)}
				</div>
			</div>
			<ul className="space-y-0.5">
				{effectiveItems.map((item, i) => (
					<li
						key={i}
						className="text-xs text-muted-foreground flex items-start gap-1"
					>
						<span className={cn("shrink-0", bulletColor)}>{bulletChar}</span>
						{item}
					</li>
				))}
			</ul>
		</div>
	)
}

function BulletEditForm({
	initial,
	label,
	labelColor,
	onSave,
	onCancel,
}: {
	initial: string[]
	label: string
	labelColor: string
	onSave: (items: string[]) => void
	onCancel: () => void
}) {
	const [items, setItems] = useState(initial.length > 0 ? initial : [""])

	function updateItem(index: number, value: string) {
		setItems((prev) => prev.map((item, i) => (i === index ? value : item)))
	}

	function removeItem(index: number) {
		setItems((prev) => prev.filter((_, i) => i !== index))
	}

	function addItem() {
		setItems((prev) => [...prev, ""])
	}

	return (
		<div className="space-y-2">
			<p
				className={cn(
					"text-[10px] font-semibold uppercase tracking-wide",
					labelColor,
				)}
			>
				{label}
			</p>
			<div className="space-y-1.5">
				{items.map((item, i) => (
					<div key={i} className="flex items-center gap-1.5">
						<Input
							value={item}
							onChange={(e) => updateItem(i, e.target.value)}
							className="h-7 text-xs flex-1"
							placeholder="Enter feedback point..."
							autoFocus={i === items.length - 1}
						/>
						<button
							type="button"
							onClick={() => removeItem(i)}
							className="rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
						>
							<X className="h-3 w-3" />
						</button>
					</div>
				))}
			</div>
			<div className="flex items-center gap-2">
				<Button size="sm" onClick={() => onSave(items)}>
					Save
				</Button>
				<Button size="sm" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				<button
					type="button"
					onClick={addItem}
					className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					<Plus className="h-3 w-3" />
					Add
				</button>
			</div>
		</div>
	)
}
