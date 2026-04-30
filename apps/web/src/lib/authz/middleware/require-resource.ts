import type { ResourceGrantRole } from "@mcp-gcse/db"
import type { z } from "zod"
import {
	type ResourceRef,
	type ResourceType,
	assertResource,
} from "../assert-resource"
import type { AuthUser } from "../principal"

export type SingleResourceSpec<TInput> = {
	type: ResourceType
	role: ResourceGrantRole
	id: (input: TInput) => string
}

export type MultiResourceSpec<TInput> = {
	type: ResourceType
	role: ResourceGrantRole
	ids: (input: TInput) => string[]
}

export type ResourceSpec<TInput> =
	| SingleResourceSpec<TInput>
	| MultiResourceSpec<TInput>

function refsForSpec<TInput>(
	spec: ResourceSpec<TInput>,
	input: TInput,
): ResourceRef[] {
	if ("id" in spec) {
		return [{ type: spec.type, id: spec.id(input), role: spec.role }]
	}
	return spec.ids(input).map((id) => ({ type: spec.type, id, role: spec.role }))
}

/**
 * Asserts that `user` has at least the requested role on every resource
 * resolved from `input` by `specs`. Throws AccessDeniedError or NotFoundError
 * on the first failure. All assertions run in parallel.
 */
export async function assertSpecAccess<
	TInput,
	TSchema extends z.ZodType<TInput>,
>(
	user: AuthUser,
	specs: ResourceSpec<TInput>[],
	input: TInput,
	_schema?: TSchema,
): Promise<void> {
	const refs = specs.flatMap((s) => refsForSpec(s, input))
	await Promise.all(refs.map((ref) => assertResource(user, ref)))
}
