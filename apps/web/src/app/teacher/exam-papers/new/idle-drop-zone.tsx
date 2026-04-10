"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Upload } from "lucide-react"
import { useRef, useState } from "react"

type IdleDropZoneProps = {
	onFileSelected: (file: File) => void
	onManual: () => void
}

export function IdleDropZone({ onFileSelected, onManual }: IdleDropZoneProps) {
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [isDragging, setIsDragging] = useState(false)

	function handleDragOver(e: React.DragEvent) {
		e.preventDefault()
		setIsDragging(true)
	}

	function handleDragLeave(e: React.DragEvent) {
		e.preventDefault()
		setIsDragging(false)
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault()
		setIsDragging(false)
		const f = e.dataTransfer.files[0]
		if (f) onFileSelected(f)
	}

	return (
		<Card>
			<CardContent className="pt-6 pb-6">
				<div
					onDragOver={handleDragOver}
					onDragEnter={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					onClick={() => fileInputRef.current?.click()}
					className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center cursor-pointer transition-colors select-none ${
						isDragging
							? "border-primary bg-primary/5"
							: "border-input hover:border-primary/50 hover:bg-muted/30"
					}`}
				>
					<div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
						<Upload className="h-7 w-7 text-primary" />
					</div>
					<p className="text-sm font-medium">Drop your exam paper PDF here</p>
					<p className="text-xs text-muted-foreground mt-1">
						or click to browse
					</p>
					<p className="text-xs text-muted-foreground mt-4 max-w-xs leading-relaxed">
						Subject, board, year, marks, duration and document type will be
						detected automatically
					</p>
				</div>
				<input
					ref={fileInputRef}
					type="file"
					accept=".pdf,application/pdf"
					className="sr-only"
					onChange={(e) => {
						const f = e.target.files?.[0]
						if (f) onFileSelected(f)
					}}
				/>
				<p className="mt-4 text-center text-sm text-muted-foreground">
					Creating a new paper from scratch?{" "}
					<Button variant="link" className="p-0 h-auto" onClick={onManual}>
						Fill in manually
					</Button>
				</p>
			</CardContent>
		</Card>
	)
}
