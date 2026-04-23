"use client"

import type { StagedScript } from "@/lib/batch/types"
import type { StagedScriptStatus } from "@mcp-gcse/db"
import { AnimatePresence, motion } from "framer-motion"
import { FileStack, X } from "lucide-react"
import { usePageCarousel } from "./hooks/use-page-carousel"
import { ListViewLockedStack } from "./list-view-locked-stack"
import { PageCarousel } from "./page-carousel"

type PaperTrayPanelProps = {
	urls: Record<string, string>
	confirmedScripts: StagedScript[]
	onToggleExclude: (id: string, status: StagedScriptStatus) => Promise<void>
}

export function PaperTrayPanel({
	urls,
	confirmedScripts,
	onToggleExclude,
}: PaperTrayPanelProps) {
	const {
		carousel,
		setCarousel,
		openCarousel: openPageCarousel,
	} = usePageCarousel(urls)

	function openCarousel(script: StagedScript, startIndex: number) {
		const name =
			script.confirmed_name ?? script.proposed_name ?? "Unnamed student"
		openPageCarousel(script, startIndex, name)
	}

	const count = confirmedScripts.length

	return (
		<>
			<div>
				{count === 0 ? (
					<motion.div
						key="empty"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-16 text-center"
					>
						<FileStack className="h-8 w-8 text-muted-foreground/30" />
						<p className="text-xs text-muted-foreground px-4">
							Confirmed scripts will appear here
						</p>
					</motion.div>
				) : (
					<AnimatePresence mode="popLayout">
						<div className="flex flex-wrap gap-6 items-start">
							{confirmedScripts.map((script) => {
								const name =
									script.confirmed_name ??
									script.proposed_name ??
									"Unnamed student"
								const sortedPageKeys = script.page_keys
									.slice()
									.sort((a, b) => a.order - b.order)
								const pageCount = script.page_keys.length

								return (
									<motion.div
										key={script.id}
										layout
										initial={{ opacity: 0, y: -24, rotate: 4, scale: 0.88 }}
										animate={{
											opacity: 1,
											y: 0,
											rotate: 0,
											scale: 1,
											transition: {
												type: "spring",
												stiffness: 280,
												damping: 22,
											},
										}}
										exit={{
											opacity: 0,
											scale: 0.8,
											x: -20,
											transition: { duration: 0.18 },
										}}
										className="relative group/card w-fit"
									>
										<ListViewLockedStack
											pageKeys={sortedPageKeys}
											urls={urls}
											showUndo={false}
											showPageCount={false}
											onUnlock={() =>
												void onToggleExclude(script.id, script.status)
											}
											onOpenCarousel={() => openCarousel(script, 0)}
										/>

										{/* Delete button — top-right on hover */}
										<button
											type="button"
											onClick={() =>
												void onToggleExclude(script.id, script.status)
											}
											className="absolute top-2 right-2 z-30 flex items-center justify-center h-7 w-7 rounded-full bg-background/90 backdrop-blur border shadow-sm opacity-0 scale-90 group-hover/card:opacity-100 group-hover/card:scale-100 transition-all duration-150 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
											title="Remove from tray"
										>
											<X className="h-3.5 w-3.5" />
										</button>

										{/* Name overlay — slides up from bottom on hover */}
										<div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none">
											<div className="opacity-0 translate-y-2 group-hover/card:opacity-100 group-hover/card:translate-y-0 transition-all duration-200">
												<div className="mx-2 mb-2 rounded-lg bg-background/95 backdrop-blur border px-3 py-2 shadow-md">
													<p className="text-xs font-semibold truncate leading-tight">
														{name}
													</p>
													<p className="text-[10px] text-muted-foreground mt-0.5">
														{pageCount} {pageCount === 1 ? "page" : "pages"}
													</p>
												</div>
											</div>
										</div>
									</motion.div>
								)
							})}
						</div>
					</AnimatePresence>
				)}
			</div>

			{/* Page carousel — portal, renders above everything */}
			{carousel && (
				<PageCarousel
					pages={carousel.pages}
					index={carousel.index}
					scriptName={carousel.scriptName}
					onClose={() => setCarousel(null)}
					onNavigate={(i) =>
						setCarousel((prev) => (prev ? { ...prev, index: i } : prev))
					}
				/>
			)}
		</>
	)
}
