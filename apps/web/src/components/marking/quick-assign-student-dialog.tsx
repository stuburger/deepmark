"use client"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { linkStudentToJob } from "@/lib/marking/submissions/mutations"
import { queryKeys } from "@/lib/query-keys"
import { listStudents } from "@/lib/students/queries"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	jobId: string
	examPaperId: string
	detectedNumber: string | null
}

export function QuickAssignStudentDialog({
	open,
	onOpenChange,
	jobId,
	examPaperId,
	detectedNumber,
}: Props) {
	const queryClient = useQueryClient()
	const [selectedId, setSelectedId] = useState<string | null>(null)

	const { data: students = [], isLoading } = useQuery({
		queryKey: queryKeys.students(),
		queryFn: async () => {
			const r = await listStudents()
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data?.students ?? []
		},
		enabled: open,
	})

	const mutation = useMutation({
		mutationFn: async (studentId: string) => {
			const r = await linkStudentToJob({ jobId, studentId })
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data
		},
		onSuccess: () => {
			toast.success("Student linked")
			queryClient.invalidateQueries({
				queryKey: queryKeys.submissions(examPaperId),
			})
			onOpenChange(false)
			setSelectedId(null)
		},
		onError: (err) => toast.error(err.message),
	})

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Link to a student</DialogTitle>
					<DialogDescription>
						{detectedNumber ? (
							<>
								The OCR pulled{" "}
								<code className="font-mono text-xs">{detectedNumber}</code> off
								this script but we couldn&rsquo;t find a roster row with that
								number. Pick the right student below — or add them first.
							</>
						) : (
							<>
								No student number was detected on this script. Pick the right
								student manually.
							</>
						)}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{isLoading ? (
						<p className="text-sm text-muted-foreground">Loading roster…</p>
					) : students.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							You don&rsquo;t have any students yet.{" "}
							<Link
								href="/teacher/students"
								className="text-primary hover:underline"
							>
								Add one
							</Link>{" "}
							before linking.
						</p>
					) : (
						<Select
							value={selectedId ?? undefined}
							onValueChange={setSelectedId}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a student" />
							</SelectTrigger>
							<SelectContent>
								{students.map((s) => (
									<SelectItem key={s.id} value={s.id}>
										<span className="font-mono text-xs text-muted-foreground">
											{s.student_number}
										</span>
										<span className="ml-2">{s.name}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}

					<div className="flex items-center justify-between">
						<Link
							href="/teacher/students"
							className="text-xs text-muted-foreground hover:text-foreground hover:underline"
						>
							Manage roster →
						</Link>
						<div className="flex gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
								disabled={mutation.isPending}
							>
								Cancel
							</Button>
							<Button
								type="button"
								onClick={() => selectedId && mutation.mutate(selectedId)}
								disabled={!selectedId || mutation.isPending}
							>
								{mutation.isPending ? "Linking…" : "Link"}
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
