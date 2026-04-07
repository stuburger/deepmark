export function buildPageBoundaryPrompt(contextDesc: string): string {
	return `You are analysing scanned student exam scripts.
${contextDesc}
Determine whether the CURRENT page is the FIRST page of a NEW student's exam script.
Structural cues for a new script start: different student name or header at the top, question numbers resetting to the first question, a new paper title or section header, visibly different handwriting style.
Return ONLY valid JSON with no markdown or explanation:
{"isScriptStart":true,"confidence":0.95}`
}

export function buildBlankClassificationPrompt(contextDesc: string): string {
	return `You are analysing scanned student exam scripts. A blank/near-blank page has been detected.
${contextDesc}
Classify the blank page as exactly one of:
- "separator": a deliberate blank page inserted between two different student scripts
- "script_page": a blank answer page belonging to a student (e.g. a page they left unanswered)
- "artifact": scanner noise, accidental blank, or cover page
Return ONLY valid JSON with no markdown:
{"classification":"separator"}`
}

export function buildNameExtractionPrompt(): string {
	return 'Extract the student name from this exam script page if legible. Return ONLY valid JSON with no markdown: {"name":"<name>","confidence":0.95} — use null for name if not readable.'
}
