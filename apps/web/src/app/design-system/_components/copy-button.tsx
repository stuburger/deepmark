"use client"

import { Button } from "@/components/ui/button"
import { Check, Copy } from "lucide-react"
import { useState } from "react"

export function CopyButton({
	value,
	label,
}: { value: string; label?: string }) {
	const [copied, setCopied] = useState(false)

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(value)
			setCopied(true)
			setTimeout(() => setCopied(false), 1600)
		} catch {
			setCopied(false)
		}
	}

	return (
		<Button
			type="button"
			variant="secondary"
			size="sm"
			onClick={handleCopy}
			aria-label={label ? `Copy ${label}` : "Copy"}
		>
			{copied ? <Check className="text-success" /> : <Copy />}
			{copied ? "Copied" : (label ?? "Copy")}
		</Button>
	)
}
