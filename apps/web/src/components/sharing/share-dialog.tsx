"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	type ResourceGrantListItem,
	listSubmissionGrants,
	revokeResourceGrant,
	shareSubmissionsWithEmails,
	updateResourceGrantRole,
} from "@/lib/sharing/actions"
import { useCurrentUser } from "@/lib/users/use-current-user"
import type { ResourceGrantRole } from "@mcp-gcse/db"
import { X } from "lucide-react"
import {
	type ReactElement,
	useEffect,
	useMemo,
	useState,
	useTransition,
} from "react"
import { toast } from "sonner"

const INVITE_ROLES: ResourceGrantRole[] = ["owner", "editor", "viewer"]

function parseEmails(raw: string): string[] {
	return raw
		.split(/[,\s]+/)
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean)
}

function initialsFor(grant: ResourceGrantListItem): string {
	const source =
		grant.principal_name?.trim() ||
		grant.principal_email?.split("@")[0] ||
		""
	const parts = source.split(/[\s._-]+/).filter(Boolean).slice(0, 2)
	const initials = parts
		.map((p) => p[0]?.toUpperCase() ?? "")
		.join("")
		.slice(0, 2)
	return initials || "?"
}

export function ShareDialog({
	submissionIds,
	trigger,
}: {
	submissionIds: string[]
	trigger: ReactElement
}) {
	const [open, setOpen] = useState(false)
	const [emailInput, setEmailInput] = useState("")
	const [role, setRole] = useState<ResourceGrantRole>("editor")
	const [grants, setGrants] = useState<ResourceGrantListItem[]>([])
	const [pending, startTransition] = useTransition()
	const primarySubmissionId = submissionIds[0]
	const { user: currentUser } = useCurrentUser()

	const title = useMemo(
		() =>
			submissionIds.length === 1 ? "Share Submission" : "Share Submissions",
		[submissionIds.length],
	)

	useEffect(() => {
		if (!open || !primarySubmissionId) return
		startTransition(async () => {
			const result = await listSubmissionGrants({
				submissionId: primarySubmissionId,
			})
			if (result?.serverError) {
				toast.error(result.serverError)
				return
			}
			if (result?.data?.grants) setGrants(result.data.grants)
		})
	}, [open, primarySubmissionId])

	function refreshGrants() {
		if (!primarySubmissionId) return
		startTransition(async () => {
			const result = await listSubmissionGrants({
				submissionId: primarySubmissionId,
			})
			if (result?.data?.grants) setGrants(result.data.grants)
		})
	}

	function handleShare() {
		const emails = parseEmails(emailInput)
		startTransition(async () => {
			const result = await shareSubmissionsWithEmails({
				submissionIds,
				emails,
				role,
			})
			if (result?.serverError) {
				toast.error(result.serverError)
				return
			}
			toast.success("Access updated")
			setEmailInput("")
			refreshGrants()
		})
	}

	function handleRoleChange(grantId: string, nextRole: ResourceGrantRole) {
		startTransition(async () => {
			const result = await updateResourceGrantRole({ grantId, role: nextRole })
			if (result?.serverError) {
				toast.error(result.serverError)
				return
			}
			refreshGrants()
		})
	}

	function handleRevoke(grantId: string) {
		startTransition(async () => {
			const result = await revokeResourceGrant({ grantId })
			if (result?.serverError) {
				toast.error(result.serverError)
				return
			}
			refreshGrants()
		})
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={trigger} />
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>

				<div className="flex gap-2">
					<Input
						value={emailInput}
						onChange={(event) => setEmailInput(event.target.value)}
						placeholder="Email addresses"
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault()
								handleShare()
							}
						}}
					/>
					<Select
						value={role}
						onValueChange={(value) => setRole(value as ResourceGrantRole)}
					>
						<SelectTrigger className="w-32">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{INVITE_ROLES.map((option) => (
								<SelectItem key={option} value={option}>
									{option}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						onClick={handleShare}
						disabled={pending || !emailInput.trim()}
					>
						Share
					</Button>
				</div>

				<div className="space-y-2">
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						People with access
					</p>
					{grants.map((grant) => {
						const isMe =
							currentUser !== null && grant.principal_user_id === currentUser.id
						const displayName =
							grant.principal_name ?? grant.principal_email ?? "Unknown"
						return (
						<div
							key={grant.id}
							className="flex items-center gap-3 rounded-lg border px-3 py-2"
						>
							<Avatar size="sm">
								{grant.principal_avatar_url && (
									<AvatarImage
										src={grant.principal_avatar_url}
										alt={displayName}
									/>
								)}
								<AvatarFallback>{initialsFor(grant)}</AvatarFallback>
							</Avatar>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium">
									{displayName}
									{isMe && (
										<span className="ml-1.5 text-xs font-normal text-muted-foreground">
											(me)
										</span>
									)}
								</p>
								<p className="truncate text-xs text-muted-foreground">
									{grant.pending ? "Pending invite" : grant.principal_email}
								</p>
							</div>
							<Select
								value={grant.role}
								onValueChange={(value) =>
									handleRoleChange(grant.id, value as ResourceGrantRole)
								}
							>
								<SelectTrigger size="sm" className="w-32">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{INVITE_ROLES.map((option) => (
										<SelectItem key={option} value={option}>
											{option}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								onClick={() => handleRevoke(grant.id)}
								disabled={pending}
								aria-label="Remove access"
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
						)
					})}
				</div>
			</DialogContent>
		</Dialog>
	)
}
