// Two convention checks enforced as a build-time gate (lighter weight than
// adding a full ESLint pipeline for two rules):
//
//   1. no-raw-auth — `auth()` from "@/lib/auth" must only be imported inside
//      `lib/authz/*` and from page/layout files. Action handlers must go
//      through `resolveSessionUser` via the action-client middleware so the
//      authz boundary is mechanically enforced.
//
//   2. use-server-must-use-action-client — every exported async function (or
//      exported const-bound async expression) in a `"use server"` module must
//      be assigned the result of one of the action clients
//      (publicAction / authenticatedAction / adminAction / resourceAction /
//      resourcesAction / scopedAction). This is what makes "forgot to add
//      auth" a typecheck error.
//
// We parse with the TypeScript compiler API rather than using regex so the
// checks survive formatting changes and JSDoc.

import * as fs from "node:fs"
import * as path from "node:path"
import * as ts from "typescript"

export type Violation = {
	file: string
	line: number
	rule: "no-raw-auth" | "use-server-must-use-action-client"
	message: string
}

const ACTION_CLIENT_NAMES = new Set([
	"publicAction",
	"authenticatedAction",
	"adminAction",
	"resourceAction",
	"resourcesAction",
	"scopedAction",
])

// Files allowed to import the raw `auth` symbol from "@/lib/auth".
//   - lib/authz/* (where the wrapper lives)
//   - lib/auth.ts (the wrapper itself)
//   - app/**/page.tsx, app/**/layout.tsx (page-level auth gating —
//     a separate concern from action authz)
//   - app/api/**/route.ts that reach for it directly (legacy paths;
//     allowed but encouraged to migrate to routeHandler)
function isAuthAllowedFile(rel: string): boolean {
	return (
		rel.startsWith("src/lib/authz/") ||
		rel === "src/lib/auth.ts" ||
		rel.endsWith("/page.tsx") ||
		rel.endsWith("/layout.tsx") ||
		rel.endsWith("/login/page.tsx")
	)
}

function fileStartsWithUseServer(source: ts.SourceFile): boolean {
	const first = source.statements[0]
	if (!first) return false
	// In TypeScript, a "use server" directive shows up as an
	// ExpressionStatement whose expression is a StringLiteral.
	if (
		first.kind === ts.SyntaxKind.ExpressionStatement &&
		(first as ts.ExpressionStatement).expression.kind ===
			ts.SyntaxKind.StringLiteral
	) {
		const lit = (first as ts.ExpressionStatement).expression as ts.StringLiteral
		if (lit.text === "use server") return true
	}
	return false
}

function expressionUsesActionClient(node: ts.Expression): boolean {
	// Walk a chain like `resourceAction({...}).action(async (...) => ...)` to
	// find a CallExpression whose callee is an Identifier matching an action
	// client name, OR a PropertyAccessExpression on such an identifier (e.g.
	// `publicAction.action(...)`).
	let current: ts.Expression = node
	while (true) {
		if (ts.isCallExpression(current)) {
			const callee = current.expression
			if (ts.isIdentifier(callee) && ACTION_CLIENT_NAMES.has(callee.text)) {
				return true
			}
			if (ts.isPropertyAccessExpression(callee)) {
				const inner = unwrapToBase(callee.expression)
				if (ts.isIdentifier(inner) && ACTION_CLIENT_NAMES.has(inner.text)) {
					return true
				}
				current = callee.expression
				continue
			}
			// Some other call shape — not an action client.
			return false
		}
		if (ts.isPropertyAccessExpression(current)) {
			current = current.expression
			continue
		}
		return false
	}
}

function unwrapToBase(node: ts.Expression): ts.Expression {
	let current: ts.Expression = node
	while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current)) {
		current = ts.isPropertyAccessExpression(current)
			? current.expression
			: current.expression
	}
	return current
}

function checkNoRawAuth(
	source: ts.SourceFile,
	relPath: string,
): Violation[] {
	if (isAuthAllowedFile(relPath)) return []
	const violations: Violation[] = []
	for (const stmt of source.statements) {
		if (!ts.isImportDeclaration(stmt)) continue
		const moduleText = (stmt.moduleSpecifier as ts.StringLiteral).text
		if (moduleText !== "@/lib/auth") continue
		const named = stmt.importClause?.namedBindings
		if (!named || !ts.isNamedImports(named)) continue
		for (const spec of named.elements) {
			if (spec.name.text === "auth") {
				const { line } = source.getLineAndCharacterOfPosition(spec.getStart())
				violations.push({
					file: relPath,
					line: line + 1,
					rule: "no-raw-auth",
					message:
						"Direct import of `auth` from @/lib/auth is restricted to lib/authz/* and page/layout files. Use the action-client wrappers (resolveSessionUser is invoked by the middleware).",
				})
			}
		}
	}
	return violations
}

function checkUseServerMustUseActionClient(
	source: ts.SourceFile,
	relPath: string,
): Violation[] {
	if (!fileStartsWithUseServer(source)) return []
	const violations: Violation[] = []
	for (const stmt of source.statements) {
		// Skip `export type` / `export interface` / re-exports.
		if (ts.isExportDeclaration(stmt)) continue
		if (!hasExportModifier(stmt)) continue

		if (ts.isFunctionDeclaration(stmt)) {
			// `export async function foo() {...}` is forbidden — must wrap in an
			// action client.
			if (stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
				const { line } = source.getLineAndCharacterOfPosition(stmt.getStart())
				violations.push({
					file: relPath,
					line: line + 1,
					rule: "use-server-must-use-action-client",
					message: `Exported async function "${stmt.name?.text ?? "<anonymous>"}" in a "use server" module must be wrapped in an action client (publicAction / authenticatedAction / adminAction / resourceAction / resourcesAction / scopedAction).`,
				})
			}
			continue
		}

		if (ts.isVariableStatement(stmt)) {
			for (const decl of stmt.declarationList.declarations) {
				if (!decl.initializer) continue
				if (!ts.isIdentifier(decl.name)) continue
				if (!expressionUsesActionClient(decl.initializer)) {
					const { line } = source.getLineAndCharacterOfPosition(decl.getStart())
					violations.push({
						file: relPath,
						line: line + 1,
						rule: "use-server-must-use-action-client",
						message: `Exported "${decl.name.text}" in a "use server" module must be built from an action client.`,
					})
				}
			}
			continue
		}
	}
	return violations
}

function hasExportModifier(node: ts.Node): boolean {
	if (!ts.canHaveModifiers(node)) return false
	const mods = ts.getModifiers(node as ts.HasModifiers)
	return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

export function checkSourceFile(
	relPath: string,
	contents: string,
): Violation[] {
	const source = ts.createSourceFile(
		relPath,
		contents,
		ts.ScriptTarget.Latest,
		true,
	)
	return [
		...checkNoRawAuth(source, relPath),
		...checkUseServerMustUseActionClient(source, relPath),
	]
}

function isCheckable(rel: string): boolean {
	if (!rel.startsWith("src/")) return false
	if (!rel.endsWith(".ts") && !rel.endsWith(".tsx")) return false
	if (rel.includes("/__tests__/")) return false
	if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) return false
	if (rel.includes("/.next/") || rel.includes("/node_modules/")) return false
	return true
}

function* walk(root: string, base: string): Generator<string> {
	for (const entry of fs.readdirSync(path.join(root, base), {
		withFileTypes: true,
	})) {
		const rel = path.join(base, entry.name)
		if (entry.isDirectory()) {
			yield* walk(root, rel)
		} else {
			yield rel
		}
	}
}

export function checkProject(projectRoot: string): Violation[] {
	const violations: Violation[] = []
	for (const rel of walk(projectRoot, "src")) {
		if (!isCheckable(rel)) continue
		const full = path.join(projectRoot, rel)
		const contents = fs.readFileSync(full, "utf8")
		violations.push(...checkSourceFile(rel, contents))
	}
	return violations
}

if (import.meta.main) {
	const root = process.cwd()
	const violations = checkProject(root)
	if (violations.length === 0) {
		console.log("✓ Action convention checks passed")
		process.exit(0)
	}
	console.error(`Found ${violations.length} convention violation(s):\n`)
	for (const v of violations) {
		console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.message}`)
	}
	process.exit(1)
}
