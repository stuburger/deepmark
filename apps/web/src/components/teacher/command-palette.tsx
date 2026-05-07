"use client"

import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command"
import { queryKeys } from "@/lib/query-keys"
import { searchEverything } from "@/lib/search/queries"
import { useQuery } from "@tanstack/react-query"
import { FileText, User } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { useTeacherNav } from "./teacher-nav-context"

export function CommandPalette() {
	const { paletteOpen, setPaletteOpen } = useTeacherNav()
	const [q, setQ] = useState("")
	const router = useRouter()

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault()
				setPaletteOpen(!paletteOpen)
			}
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [paletteOpen, setPaletteOpen])

	// Reset query whenever the palette closes so re-opening starts clean.
	useEffect(() => {
		if (!paletteOpen) setQ("")
	}, [paletteOpen])

	const { data } = useQuery({
		queryKey: queryKeys.paletteSearch(q),
		queryFn: async () => {
			const r = await searchEverything({ q })
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data ?? { papers: [], submissions: [] }
		},
		enabled: paletteOpen && q.trim().length > 0,
		staleTime: 10_000,
	})

	function go(url: string) {
		setPaletteOpen(false)
		router.push(url)
	}

	const papers = data?.papers ?? []
	const submissions = data?.submissions ?? []
	const hasResults = papers.length > 0 || submissions.length > 0

	return (
		<CommandDialog
			open={paletteOpen}
			onOpenChange={setPaletteOpen}
			title="Search"
			description="Search papers and submissions"
			className="data-[size=default]:top-[10vh] data-[size=default]:-translate-y-0 sm:max-w-xl!"
		>
			<Command shouldFilter={false}>
				<CommandInput
					placeholder="Search papers, students, submissions…"
					value={q}
					onValueChange={setQ}
				/>
				<CommandList>
					{q.trim().length === 0 ? (
						<div className="px-3 py-6 text-center text-xs text-muted-foreground">
							Start typing to search papers and submissions.
						</div>
					) : !hasResults ? (
						<CommandEmpty>No results.</CommandEmpty>
					) : null}

					{papers.length > 0 && (
						<CommandGroup heading="Papers">
							{papers.map((p) =>
								p.kind === "paper" ? (
									<CommandItem
										key={`paper-${p.id}`}
										value={`paper-${p.id}-${p.title}`}
										onSelect={() => go(`/teacher/exam-papers/${p.id}`)}
									>
										<FileText className="size-4 text-muted-foreground" />
										<span className="truncate">{p.title}</span>
										<span className="ml-auto text-xs text-muted-foreground capitalize">
											{p.subject.replace(/_/g, " ")}
										</span>
									</CommandItem>
								) : null,
							)}
						</CommandGroup>
					)}

					{submissions.length > 0 && (
						<CommandGroup heading="Submissions">
							{submissions.map((s) =>
								s.kind === "submission" ? (
									<CommandItem
										key={`sub-${s.id}`}
										value={`sub-${s.id}-${s.student_name ?? "Unnamed"}`}
										onSelect={() =>
											go(`/teacher/exam-papers/${s.paper_id}?job=${s.id}`)
										}
									>
										<User className="size-4 text-muted-foreground" />
										<span className="truncate">
											{s.student_name ?? "Unnamed"}
										</span>
										<span className="ml-auto truncate text-xs text-muted-foreground">
											{s.paper_title}
										</span>
									</CommandItem>
								) : null,
							)}
						</CommandGroup>
					)}
				</CommandList>
			</Command>
		</CommandDialog>
	)
}
