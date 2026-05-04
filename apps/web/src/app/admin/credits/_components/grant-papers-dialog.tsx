"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { grantPapersToUser } from "@/lib/admin/credits/mutations"
import { useRouter } from "next/navigation"

type Props = {
	userId: string
	userEmail: string | null
	currentBalance: number
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function GrantPapersDialog(props: Props) {
	const router = useRouter()
	const [papers, setPapers] = useState<string>("")
	const [note, setNote] = useState<string>("")
	const [submitting, setSubmitting] = useState(false)

	const parsedPapers = Number.parseInt(papers, 10)
	const isValid = Number.isFinite(parsedPapers) && parsedPapers !== 0

	async function handleSubmit() {
		if (!isValid) return
		setSubmitting(true)
		const result = await grantPapersToUser({
			userId: props.userId,
			papers: parsedPapers,
			note: note.trim() || undefined,
		})
		setSubmitting(false)

		if (result?.serverError) {
			toast.error(result.serverError)
			return
		}
		if (result?.validationErrors) {
			toast.error("Invalid input — check the form.")
			return
		}
		toast.success(
			`Granted ${parsedPapers > 0 ? "+" : ""}${parsedPapers} ${
				Math.abs(parsedPapers) === 1 ? "paper" : "papers"
			} to ${props.userEmail ?? "user"}.`,
		)
		setPapers("")
		setNote("")
		props.onOpenChange(false)
		router.refresh()
	}

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Grant papers</DialogTitle>
					<DialogDescription>
						{props.userEmail ?? "User"} · current balance{" "}
						<span className="font-medium text-foreground">
							{props.currentBalance}
						</span>
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div className="space-y-2">
						<label htmlFor="grant-papers-input" className="text-sm font-medium">
							Papers
						</label>
						<Input
							id="grant-papers-input"
							type="number"
							inputMode="numeric"
							placeholder="e.g. 30 (or -10 to reverse)"
							value={papers}
							onChange={(e) => setPapers(e.target.value)}
							autoFocus
						/>
						<p className="text-xs text-muted-foreground">
							Positive adds credit; negative reverses a prior grant.
						</p>
					</div>
					<div className="space-y-2">
						<label htmlFor="grant-note-input" className="text-sm font-medium">
							Note <span className="text-muted-foreground">(optional)</span>
						</label>
						<Input
							id="grant-note-input"
							placeholder="Why? — e.g. compensation for outage 2026-05-15"
							value={note}
							onChange={(e) => setNote(e.target.value)}
							maxLength={500}
						/>
					</div>
					{isValid ? (
						<p className="text-sm text-muted-foreground">
							New balance after grant:{" "}
							<span className="font-medium text-foreground">
								{props.currentBalance + parsedPapers}
							</span>
						</p>
					) : null}
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => props.onOpenChange(false)}
						disabled={submitting}
					>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={!isValid || submitting}>
						{submitting ? "Granting…" : "Grant"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
