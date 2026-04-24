"use client"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { FileText, Loader2, Trash2, Upload } from "lucide-react"
import { useBatchUpload } from "./hooks/use-batch-upload"

export function UploadScriptsDialog({
	examPaperId,
	open,
	onOpenChange,
	onBatchStarted,
}: {
	examPaperId: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onBatchStarted?: () => void
}) {
	const batch = useBatchUpload({ examPaperId, onOpenChange, onBatchStarted })

	return (
		<Dialog open={open} onOpenChange={batch.handleOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				{/* ── Phase 1: Upload ── */}
				{batch.phase === "upload" && (
					<>
						<DialogHeader>
							<DialogTitle>Upload student scripts</DialogTitle>
							<DialogDescription>
								Upload PDFs or images. DeepMark will read each file and split
								multi-student PDFs into individual scripts for you to review
								before marking.
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-4">
							{/* Drop / upload area */}
							<div className="space-y-3">
								<button
									type="button"
									onClick={() => batch.fileInputRef.current?.click()}
									className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 py-8 text-center transition-colors hover:bg-muted/30 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<Upload className="h-8 w-8 text-muted-foreground" />
									<div>
										<p className="text-sm font-medium">Click to upload</p>
										<p className="text-xs text-muted-foreground mt-0.5">
											PDFs and images — multiple files supported
										</p>
									</div>
								</button>

								{batch.files.length > 0 && (
									<div className="space-y-1.5 max-h-48 overflow-y-auto">
										{batch.files.map((file) => (
											<div
												key={file.name}
												className="flex items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2"
											>
												{file.uploading ? (
													<Spinner className="h-4 w-4 shrink-0 text-muted-foreground" />
												) : (
													<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
												)}
												<div className="flex-1 min-w-0">
													<p className="text-sm truncate">{file.name}</p>
													{file.error ? (
														<p className="text-xs text-destructive">
															{file.error}
														</p>
													) : file.uploading ? (
														<p className="text-xs text-muted-foreground">
															Uploading…
														</p>
													) : (
														<p className="text-xs text-muted-foreground">
															Ready
														</p>
													)}
												</div>
												{!file.uploading && (
													<Button
														variant="ghost"
														size="icon-xs"
														onClick={() =>
															batch.setFiles((prev) =>
																prev.filter((f) => f.name !== file.name),
															)
														}
														className="shrink-0 text-muted-foreground hover:text-destructive"
													>
														<Trash2 className="h-3.5 w-3.5" />
													</Button>
												)}
											</div>
										))}
									</div>
								)}
							</div>
						</div>

						<DialogFooter>
							{batch.files.length > 0 && !batch.isUploading && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => batch.fileInputRef.current?.click()}
								>
									+ Add more
								</Button>
							)}
							<Button
								disabled={!batch.canStart}
								onClick={batch.handleStartClassifying}
							>
								{batch.isUploading ? (
									<>
										<Spinner className="h-4 w-4 mr-2" />
										Uploading…
									</>
								) : (
									"Analyse scripts"
								)}
							</Button>
						</DialogFooter>
					</>
				)}

				{/* ── Phase 2: Classifying ── */}
				{batch.phase === "classifying" && (
					<>
						<DialogHeader>
							<DialogTitle>Finding student scripts</DialogTitle>
							<DialogDescription>
								We're reading each page and splitting your upload into
								individual student scripts. You can safely close this window —
								processing continues in the background, and the scripts will
								appear here when they're ready.
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col items-center gap-4 py-8">
							<Loader2 className="h-10 w-10 animate-spin text-primary" />
							<p className="text-sm text-muted-foreground">
								Usually takes under a minute…
							</p>
						</div>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => batch.handleOpenChange(false)}
							>
								Close
							</Button>
						</DialogFooter>
					</>
				)}

				<input
					ref={batch.fileInputRef}
					type="file"
					accept="image/*,application/pdf"
					multiple
					className="sr-only"
					onChange={(e) => {
						batch.handleFiles(e.target.files)
						e.target.value = ""
					}}
				/>
			</DialogContent>
		</Dialog>
	)
}
