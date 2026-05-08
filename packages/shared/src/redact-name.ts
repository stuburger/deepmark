export function redactName(fullName: string | null | undefined): string | null {
	if (!fullName) return null
	const trimmed = fullName.trim().replace(/\s+/g, " ")
	if (!trimmed) return null
	const tokens = trimmed.split(" ")
	if (tokens.length === 1) return tokens[0] ?? null
	const first = tokens[0]
	const last = tokens[tokens.length - 1]
	const lastInitial = (last ?? "").charAt(0).toUpperCase()
	return lastInitial ? `${first} ${lastInitial}` : (first ?? null)
}
