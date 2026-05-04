"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { deleteLedgerEntry } from "@/lib/admin/credits/mutations"
import {
	type LedgerEntryRow,
	getUserLedgerHistory,
} from "@/lib/admin/credits/queries"
import { Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

type Props = {
	userId: string
	userEmail: string | null
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function UserLedgerSheet(props: Props) {
	const router = useRouter()
	const [entries, setEntries] = useState<LedgerEntryRow[] | null>(null)
	const [balance, setBalance] = useState<number>(0)
	const [loading, setLoading] = useState(false)
	const [confirmDelete, setConfirmDelete] = useState<LedgerEntryRow | null>(
		null,
	)
	const [deleting, setDeleting] = useState(false)

	useEffect(() => {
		if (!props.open) {
			setEntries(null)
			return
		}
		let cancelled = false
		setLoading(true)
		getUserLedgerHistory({ userId: props.userId, limit: 100 })
			.then((result) => {
				if (cancelled) return
				if (result?.serverError) {
					toast.error(result.serverError)
					setEntries([])
					return
				}
				setEntries(result?.data?.entries ?? [])
				setBalance(result?.data?.balance ?? 0)
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [props.open, props.userId])

	async function handleDelete(entry: LedgerEntryRow) {
		setDeleting(true)
		const result = await deleteLedgerEntry({ entryId: entry.id })
		setDeleting(false)
		if (result?.serverError) {
			toast.error(result.serverError)
			return
		}
		toast.success("Ledger entry deleted.")
		setConfirmDelete(null)
		// Optimistic-ish: drop the row locally and refresh the parent table.
		setEntries((current) => current?.filter((e) => e.id !== entry.id) ?? null)
		setBalance((current) => current - entry.papers)
		router.refresh()
	}

	return (
		<>
			<Sheet open={props.open} onOpenChange={props.onOpenChange}>
				<SheetContent className="w-full sm:max-w-2xl">
					<SheetHeader>
						<SheetTitle>Ledger · {props.userEmail ?? "user"}</SheetTitle>
						<SheetDescription>
							Balance{" "}
							<span className="font-medium text-foreground">{balance}</span>{" "}
							{balance === 1 ? "paper" : "papers"} · most recent first
						</SheetDescription>
					</SheetHeader>
					<div className="px-4 pb-6 pt-2">
						{loading ? (
							<p className="text-sm text-muted-foreground">Loading…</p>
						) : entries === null ? null : entries.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No ledger entries yet.
							</p>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Date</TableHead>
										<TableHead>Kind</TableHead>
										<TableHead className="text-right">Papers</TableHead>
										<TableHead>Note / Ref</TableHead>
										<TableHead className="w-[1%]" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{entries.map((e) => (
										<TableRow key={e.id}>
											<TableCell className="whitespace-nowrap text-xs text-muted-foreground">
												{e.created_at.toLocaleString("en-GB", {
													day: "2-digit",
													month: "short",
													year: "2-digit",
													hour: "2-digit",
													minute: "2-digit",
												})}
											</TableCell>
											<TableCell>
												<Badge variant="outline" className="text-xs">
													{e.kind.replace(/_/g, " ")}
												</Badge>
											</TableCell>
											<TableCell
												className={`text-right font-mono text-sm ${
													e.papers >= 0 ? "text-foreground" : "text-destructive"
												}`}
											>
												{e.papers > 0 ? "+" : ""}
												{e.papers}
											</TableCell>
											<TableCell className="text-xs text-muted-foreground">
												<EntryReference entry={e} />
											</TableCell>
											<TableCell>
												<Button
													variant="ghost"
													size="icon"
													onClick={() => setConfirmDelete(e)}
													aria-label="Delete entry"
												>
													<Trash2 className="size-4" />
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</div>
				</SheetContent>
			</Sheet>
			{confirmDelete ? (
				<ConfirmDialog
					open={true}
					onOpenChange={(open) => {
						if (!open) setConfirmDelete(null)
					}}
					title="Delete ledger entry?"
					description={`This hard-deletes the row (${confirmDelete.kind} ${
						confirmDelete.papers > 0 ? "+" : ""
					}${confirmDelete.papers}). For production refunds, prefer a negative grant via the Grant button instead.`}
					confirmLabel="Delete"
					destructive
					loading={deleting}
					onConfirm={() => handleDelete(confirmDelete)}
				/>
			) : null}
		</>
	)
}

function EntryReference({ entry }: { entry: LedgerEntryRow }) {
	if (entry.note) return <span>{entry.note}</span>
	if (entry.granted_by_email) {
		return <span>by {entry.granted_by_email}</span>
	}
	if (entry.stripe_invoice_id) {
		return <span className="font-mono">{entry.stripe_invoice_id}</span>
	}
	if (entry.stripe_session_id) {
		return <span className="font-mono">{entry.stripe_session_id}</span>
	}
	if (entry.grading_run_id) {
		return <span className="font-mono">run {entry.grading_run_id}</span>
	}
	if (entry.period_id) {
		return <span className="font-mono">period {entry.period_id}</span>
	}
	return null
}
