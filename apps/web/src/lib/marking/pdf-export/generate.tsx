import { Document, pdf } from "@react-pdf/renderer"
import { PDFDocument } from "pdf-lib"
import type { ReactElement } from "react"
import type {
	PageToken,
	StudentPaperAnnotation,
	StudentPaperResultPayload,
} from "../types"
import { CoverPage } from "./cover-page"
import { LegendPage } from "./legend-page"
import { StudentSection } from "./student-section"
import { type ClassExportMeta, paddingFor } from "./types"

async function renderSectionBytes(page: ReactElement): Promise<Uint8Array> {
	const blob = await pdf(<Document>{page}</Document>).toBlob()
	const arrayBuffer = await blob.arrayBuffer()
	return new Uint8Array(arrayBuffer)
}

async function copyPagesInto(
	out: PDFDocument,
	bytes: Uint8Array,
): Promise<void> {
	const src = await PDFDocument.load(bytes)
	const indices = src.getPageIndices()
	const copied = await out.copyPages(src, indices)
	for (const p of copied) out.addPage(p)
}

function addBlankPages(out: PDFDocument, count: number) {
	if (count <= 0) return
	// Use A4 dimensions in points (595.28 × 841.89)
	for (let i = 0; i < count; i++) {
		out.addPage([595.28, 841.89])
	}
}

// Pad the document so the cumulative page count lands on a sheet boundary.
// Using the cumulative total (rather than each section's own length) means
// students never bleed into each other even though the cover intentionally
// isn't padded and may share a sheet with the first student.
function padToBoundary(out: PDFDocument, multiple: number) {
	if (multiple <= 1) return
	const remainder = out.getPageCount() % multiple
	if (remainder === 0) return
	addBlankPages(out, multiple - remainder)
}

export async function generateClassReport({
	meta,
	students,
	annotationsBySubmission = {},
	tokensBySubmission = {},
	includeAnnotations = false,
}: {
	meta: ClassExportMeta
	students: StudentPaperResultPayload[]
	annotationsBySubmission?: Record<string, StudentPaperAnnotation[]>
	tokensBySubmission?: Record<string, PageToken[]>
	includeAnnotations?: boolean
}): Promise<Uint8Array> {
	const multiple = paddingFor(meta.printLayout)
	const out = await PDFDocument.create()

	const hasAnyAnnotations =
		includeAnnotations &&
		Object.values(annotationsBySubmission).some((list) => list.length > 0)

	const coverBytes = await renderSectionBytes(
		<CoverPage meta={meta} students={students} />,
	)
	await copyPagesInto(out, coverBytes)
	// Pad the cover so the first student starts on a fresh sheet — otherwise
	// 2-up duplex prints the cover on the same physical sheet as the first
	// student's opening page(s).
	padToBoundary(out, multiple)

	for (let i = 0; i < students.length; i++) {
		const student = students[i]
		const submissionId = student.submission_id ?? ""
		const studentAnnotations = includeAnnotations
			? (annotationsBySubmission[submissionId] ?? [])
			: []
		const studentTokens = includeAnnotations
			? (tokensBySubmission[submissionId] ?? [])
			: []

		const studentBytes = await renderSectionBytes(
			<StudentSection
				student={student}
				studentIndex={i}
				studentTotal={students.length}
				annotations={studentAnnotations}
				pageTokens={studentTokens}
			/>,
		)
		await copyPagesInto(out, studentBytes)

		// Pad to the next sheet boundary after every student (and before the
		// legend if present) — trailing blanks on the last sheet waste paper
		// otherwise.
		const hasTrailingSection = i < students.length - 1 || hasAnyAnnotations
		if (hasTrailingSection) {
			padToBoundary(out, multiple)
		}
	}

	if (hasAnyAnnotations) {
		const legendBytes = await renderSectionBytes(
			<LegendPage annotationsBySubmission={annotationsBySubmission} />,
		)
		await copyPagesInto(out, legendBytes)
	}

	return out.save()
}

export async function generateSingleStudentReport({
	student,
	annotations = [],
	pageTokens = [],
	includeAnnotations,
}: {
	student: StudentPaperResultPayload
	annotations?: StudentPaperAnnotation[]
	pageTokens?: PageToken[]
	includeAnnotations: boolean
}): Promise<Uint8Array> {
	const out = await PDFDocument.create()

	const studentBytes = await renderSectionBytes(
		<StudentSection
			student={student}
			studentIndex={0}
			studentTotal={1}
			annotations={includeAnnotations ? annotations : []}
			pageTokens={includeAnnotations ? pageTokens : []}
		/>,
	)
	await copyPagesInto(out, studentBytes)

	if (includeAnnotations && annotations.length > 0) {
		const submissionId = student.submission_id ?? "single"
		const legendBytes = await renderSectionBytes(
			<LegendPage annotationsBySubmission={{ [submissionId]: annotations }} />,
		)
		await copyPagesInto(out, legendBytes)
	}

	return out.save()
}
