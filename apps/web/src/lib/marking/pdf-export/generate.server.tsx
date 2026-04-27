import { Document, renderToBuffer } from "@react-pdf/renderer"
import type { ReactElement } from "react"
import { type ClassReportInput, buildClassReport } from "./generate"

async function renderViaBuffer(page: ReactElement): Promise<Uint8Array> {
	const buffer = await renderToBuffer(<Document>{page}</Document>)
	return new Uint8Array(buffer)
}

export async function generateClassReportServer(
	input: ClassReportInput,
): Promise<Uint8Array> {
	return buildClassReport(input, renderViaBuffer)
}
