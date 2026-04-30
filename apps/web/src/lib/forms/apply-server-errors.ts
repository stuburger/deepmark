import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form"

export type FlattenedValidationErrors = {
	formErrors?: string[]
	fieldErrors: Record<string, string[] | undefined>
}

/**
 * Thrown by mutation `mutationFn` wrappers when an action returns
 * `validationErrors`. Preserves the structured errors so the caller's
 * `onError` can route them through `applyServerValidationErrors`. Without
 * this, mutationFn would either swallow validationErrors (silent success)
 * or collapse them to a single Error message.
 */
export class ActionValidationError extends Error {
	readonly validationErrors: FlattenedValidationErrors
	constructor(
		validationErrors: FlattenedValidationErrors,
		fallbackMessage = "Invalid input",
	) {
		super(
			validationErrors.formErrors?.[0] ??
				Object.values(validationErrors.fieldErrors).flat()[0] ??
				fallbackMessage,
		)
		this.name = "ActionValidationError"
		this.validationErrors = validationErrors
	}
}

/**
 * Apply next-safe-action's flattened validationErrors onto a react-hook-form.
 *
 * Server keys listed in `fieldMap` are routed to `setError` on the matched
 * form field. Anything not mapped — plus any `formErrors` — is returned as a
 * single banner string for toast-style display. Top-level `formErrors` win
 * over unmapped fieldErrors when populating the banner.
 *
 * Action input shapes that are flat (e.g. `{ keepQuestionId, discardQuestionId }`)
 * pair cleanly with this helper. Nested shapes (`{ questionId, input: ... }`)
 * surface their inner failures under the parent key — those land in the banner
 * unless you map the parent key explicitly.
 */
export function applyServerValidationErrors<T extends FieldValues>(
	form: UseFormReturn<T>,
	validationErrors: FlattenedValidationErrors,
	fieldMap: Partial<Record<string, FieldPath<T>>> = {},
): string | null {
	let banner: string | null = validationErrors.formErrors?.[0] ?? null
	for (const [serverKey, msgs] of Object.entries(validationErrors.fieldErrors)) {
		const msg = msgs?.[0]
		if (!msg) continue
		const formField = fieldMap[serverKey]
		if (formField) {
			form.setError(formField, { type: "server", message: msg })
		} else {
			banner ??= msg
		}
	}
	return banner
}
