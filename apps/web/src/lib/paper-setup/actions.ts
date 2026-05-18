"use server"

import { authenticatedAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { callLlmWithFallback } from "@/lib/llm-runtime"
import {
	CopyObjectCommand,
	GetObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { Output, generateText } from "ai"
import { Resource } from "sst"
import { z } from "zod"
import type { ClassifiedStagedFile } from "./types"

const s3 = new S3Client({})
const sqs = new SQSClient({})
const bucketName = Resource.ScansBucket.name

const METADATA_TEMP_PREFIX = "pdfs/metadata-temp"

const ClassificationSchema = z.object({
	label: z
		.enum([
			"question_paper",
			"mark_scheme",
			"stimulus_pack",
			"scripts_bundle",
			"unrecognised",
		])
		.describe(
			"question_paper = a CLEAN published exam paper — printed questions + empty answer space + empty candidate-info boxes (surname/centre/candidate number all blank). mark_scheme = examiner reference document (mark allocations, level descriptors, AOs, indicative content). stimulus_pack = an insert / resource booklet that contains source material referenced by the question paper (literary extracts, sources, items, figures, data tables) — has prose / sources but NO printed questions and NO answer space; Pearson labels it 'Insert Booklet' / 'Reading Text Insert', AQA labels it 'Insert' or 'Source Booklet'. scripts_bundle = scanned student attempt(s) — the SAME printed Pearson/AQA paper as a question_paper, but with handwriting layered on top: filled-in candidate-info boxes (any name/class/number written in the candidate box, or a teacher/class annotation written near the cover header) and handwriting in the answer spaces. A long document (>30 pages) that contains repeated cover pages or filled answer spaces is also scripts_bundle. unrecognised = does not fit any category.",
		),
	confidence: z
		.enum(["low", "medium", "high"])
		.describe("Self-assessed confidence in the label."),
})

const classifyInput = z.object({
	files: z
		.array(
			z.object({
				tempUploadId: z
					.string()
					.refine(
						(v) => v.startsWith(METADATA_TEMP_PREFIX),
						"Invalid staging key",
					),
			}),
		)
		.min(1)
		.max(10),
})

/**
 * Classifies one-to-many staged PDFs (uploaded via the existing temp
 * presigned-PUT flow) into question_paper / mark_scheme / scripts_bundle.
 * Runs all files in parallel. Each failing classification surfaces as
 * `label: "unrecognised"` plus an `error` so the UI can prompt the teacher
 * to drag-assign it.
 */
export const classifyStagedFiles = authenticatedAction
	.inputSchema(classifyInput)
	.action(
		async ({
			parsedInput: { files },
			ctx,
		}): Promise<{ classifications: ClassifiedStagedFile[] }> => {
			ctx.log.info("classifyStagedFiles called", { count: files.length })

			const classifications = await Promise.all(
				files.map(async (f): Promise<ClassifiedStagedFile> => {
					try {
						const pdfBase64 = await fetchTempPdf(f.tempUploadId)
						const { output } = await callLlmWithFallback(
							"paper-setup-classifier",
							async (model, entry, report) => {
								const r = await generateText({
									model,
									temperature: entry.temperature,
									messages: [
										{
											role: "user",
											content: [
												{
													type: "file",
													data: pdfBase64,
													mediaType: "application/pdf",
												},
												{
													type: "text",
													text: "Classify this PDF into one of: question_paper, mark_scheme, stimulus_pack, scripts_bundle, unrecognised. Look at the cover page first, and sample one mid-document page if the cover is ambiguous. Decisive signals:\n- question_paper: printed questions + empty answer space + EMPTY candidate-info boxes (surname/centre/candidate number all unfilled). The cover is pristine Pearson/AQA printing with no ink on top.\n- scripts_bundle: the SAME printed Pearson/AQA cover but with handwriting layered on it — any handwritten name in the candidate-info box, a teacher/class annotation written near the cover header, or visible student handwriting in answer spaces on later pages. A filled-in candidate box is enough on its own. Long documents (>30 pages) of scanned Pearson/AQA paper with handwriting throughout are always scripts_bundle, never question_paper.\n- mark_scheme: mark allocations / level descriptors / AOs / indicative content; no answer space at all.\n- stimulus_pack: insert / resource booklet (Pearson 'Reading Text Insert', AQA 'Insert' or 'Source Booklet') with source prose / extracts / items / figures referenced by the QP and NO printed questions and NO answer space — the cover usually carries text like 'Insert Booklet' or 'Do not return this Booklet with the question paper'.\n- unrecognised: doesn't fit any category.",
												},
											],
										},
									],
									output: Output.object({ schema: ClassificationSchema }),
								})
								report.usage = r.usage
								return r
							},
						)
						return {
							tempUploadId: f.tempUploadId,
							label: output.label,
							error: null,
						}
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err)
						ctx.log.warn("classifyStagedFiles file failed", {
							tempUploadId: f.tempUploadId,
							error: message,
						})
						return {
							tempUploadId: f.tempUploadId,
							label: "unrecognised",
							error: message,
						}
					}
				}),
			)
			return { classifications }
		},
	)

const createInput = z.object({
	files: z
		.array(
			z.object({
				tempUploadId: z
					.string()
					.refine(
						(v) => v.startsWith(METADATA_TEMP_PREFIX),
						"Invalid staging key",
					),
				label: z.enum([
					"question_paper",
					"mark_scheme",
					"stimulus_pack",
					"scripts_bundle",
				]),
				filename: z.string().trim().min(1).max(255),
			}),
		)
		.min(1)
		.max(5),
})

/**
 * Upload-and-go: creates a PaperSetupSession + PaperSetupStagedFile rows,
 * copies each staged file into its durable S3 location, and dispatches the
 * bundle processor — and, in parallel, dispatches the batch classifier if
 * a scripts PDF is also dropped. Returns the new session id so the client
 * can redirect to /teacher/sessions/[id].
 *
 * Pipelines are independent:
 *   - Bundle handler reads from `pdfs/paper-setup/{sessionId}/*.pdf`, creates
 *     ExamPaper, writes `session.exam_paper_id`. If a BatchIngestJob is
 *     already running for this session it stitches `batch.exam_paper_id`.
 *   - Batch handler reads from `batches/{batchJobId}/source/`, produces
 *     staged_scripts. When the batch was dispatched as part of a wizard
 *     session, it auto-confirms staged_scripts and flips `status='committed'`.
 *
 * State is derived in queries — there is no `session.status` column.
 *
 * v1.1 requires both a question paper AND a mark scheme. The scripts PDF
 * is optional; when present, segmentation runs in parallel with extraction.
 */
export const createPaperFromStaged = authenticatedAction
	.inputSchema(createInput)
	.action(
		async ({ parsedInput: { files }, ctx }): Promise<{ sessionId: string }> => {
			const qp = files.filter((f) => f.label === "question_paper")
			const ms = files.filter((f) => f.label === "mark_scheme")
			const stim = files.filter((f) => f.label === "stimulus_pack")
			const scripts = files.filter((f) => f.label === "scripts_bundle")

			if (qp.length === 0) throw new Error("A question paper is required.")
			if (qp.length > 1) throw new Error("Only one question paper allowed.")
			if (ms.length === 0)
				throw new Error(
					"A mark scheme is required. Upload one alongside the question paper.",
				)
			if (ms.length > 1) throw new Error("Only one mark scheme allowed.")
			if (stim.length > 1) throw new Error("Only one stimulus pack allowed.")
			if (scripts.length > 1)
				throw new Error("Only one scripts PDF allowed for v1.")

			const qpFile = qp[0]
			const msFile = ms[0]
			const stimFile = stim[0]
			const scriptsFile = scripts[0]

			ctx.log.info("createPaperFromStaged called", {
				slots: {
					qp: true,
					ms: true,
					stimulus: stim.length,
					scripts: scripts.length,
				},
			})

			const session = await db.paperSetupSession.create({
				data: { created_by_id: ctx.user.id },
			})

			// Dispatch the batch up-front so we have its id before we copy the
			// scripts PDF (which lands directly in the batch's source prefix —
			// the batch handler reads from `batches/{id}/source/` via
			// listSourceFiles). The batch starts with exam_paper_id=null; the
			// bundle handler stitches it when the paper is created.
			const batch = scriptsFile
				? await db.batchIngestJob.create({
						data: {
							uploaded_by: ctx.user.id,
							paper_setup_session_id: session.id,
							exam_paper_id: null,
							status: "uploading",
						},
					})
				: null

			const qpDestKey = sessionFileKey(session.id, "question-paper.pdf")
			const msDestKey = sessionFileKey(session.id, "mark-scheme.pdf")
			const stimDestKey = stimFile
				? sessionFileKey(session.id, "stimulus-pack.pdf")
				: null
			const scriptsDestKey =
				scriptsFile && batch
					? batchSourceKey(batch.id, scriptsFile.filename)
					: null

			await db.paperSetupStagedFile.createMany({
				data: [
					{
						session_id: session.id,
						s3_bucket: bucketName,
						s3_key: qpDestKey,
						filename: qpFile.filename,
						kind: "question_paper",
					},
					{
						session_id: session.id,
						s3_bucket: bucketName,
						s3_key: msDestKey,
						filename: msFile.filename,
						kind: "mark_scheme",
					},
					...(stimFile && stimDestKey
						? [
								{
									session_id: session.id,
									s3_bucket: bucketName,
									s3_key: stimDestKey,
									filename: stimFile.filename,
									kind: "stimulus_pack" as const,
								},
							]
						: []),
					...(scriptsFile && scriptsDestKey
						? [
								{
									session_id: session.id,
									s3_bucket: bucketName,
									s3_key: scriptsDestKey,
									filename: scriptsFile.filename,
									kind: "scripts_bundle" as const,
								},
							]
						: []),
				],
			})

			// Copy temp → durable. QP + MS (+ optional stimulus) live under
			// pdfs/paper-setup/ (no S3 event triggers there). Scripts land
			// directly in the batch source prefix — single copy, single source
			// of truth.
			await Promise.all([
				copyTempToDurable(qpFile.tempUploadId, qpDestKey),
				copyTempToDurable(msFile.tempUploadId, msDestKey),
				...(stimFile && stimDestKey
					? [copyTempToDurable(stimFile.tempUploadId, stimDestKey)]
					: []),
				...(scriptsFile && scriptsDestKey
					? [copyTempToDurable(scriptsFile.tempUploadId, scriptsDestKey)]
					: []),
			])

			await Promise.all([
				sqs.send(
					new SendMessageCommand({
						QueueUrl: Resource.PaperBundleQueue.url,
						MessageBody: JSON.stringify({ sessionId: session.id }),
					}),
				),
				...(batch
					? [
							sqs.send(
								new SendMessageCommand({
									QueueUrl: Resource.BatchClassifyQueue.url,
									MessageBody: JSON.stringify({
										batch_ingest_job_id: batch.id,
									}),
								}),
							),
						]
					: []),
			])
			ctx.log.info("Queues dispatched", {
				sessionId: session.id,
				batchId: batch?.id ?? null,
			})

			return { sessionId: session.id }
		},
	)

// ── helpers ─────────────────────────────────────────────────────────────────

const SESSION_PREFIX = "pdfs/paper-setup"

function sessionFileKey(sessionId: string, filename: string): string {
	return `${SESSION_PREFIX}/${sessionId}/${filename}`
}

function batchSourceKey(batchId: string, filename: string): string {
	return `batches/${batchId}/source/${filename}`
}

async function fetchTempPdf(s3Key: string): Promise<string> {
	const cmd = new GetObjectCommand({ Bucket: bucketName, Key: s3Key })
	const response = await s3.send(cmd)
	const body = await response.Body?.transformToByteArray()
	if (!body?.length) throw new Error("Empty staged PDF")
	return Buffer.from(body).toString("base64")
}

async function copyTempToDurable(
	tempKey: string,
	destKey: string,
): Promise<void> {
	await s3.send(
		new CopyObjectCommand({
			Bucket: bucketName,
			CopySource: `${bucketName}/${tempKey}`,
			Key: destKey,
			ContentType: "application/pdf",
		}),
	)
}
