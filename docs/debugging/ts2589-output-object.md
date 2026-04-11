# TS2589: `Output.object` deep type instantiation

**Status:** Unresolved (cosmetic IDE error, does not block builds or runtime)
**File:** `packages/backend/src/lib/scan-extraction/vision-reconcile.ts:134`
**Error:** `Type instantiation is excessively deep and possibly infinite. ts(2589)`
**Date:** 2026-04-11

## Context

The error appears on the `output: Output.object({ schema: ReconcileSchema })` line inside a `generateText()` call from the Vercel AI SDK (`ai@6.0.116`) with Zod v4 (`zod@4.3.6`).

The `ReconcileSchema` is a simple Zod schema:

```ts
z.object({
  corrections: z.array(
    z.object({
      text_raw: z.string().describe("..."),
      text_corrected: z.string().describe("..."),
    })
  ).describe("..."),
})
```

## The puzzle

Other call sites using the exact same `Output.object({ schema })` pattern do NOT show this error in the IDE. For example, `gemini-ocr.ts` uses an identical pattern and is clean.

## What we tried

### 1. Remove `.describe()` chains from the schema
**Hypothesis:** `.describe()` adds extra type wrapping that deepens inference.
**Result:** No effect. Error persisted.

### 2. Inline the schema in the same file
**Hypothesis:** Cross-module import adds a type resolution layer. `gemini-ocr.ts` defines its schema inline and works fine.
**Result:** No effect. Error persisted even with schema defined in the same file.

### 3. Extract the `generateText` call into a standalone top-level function
**Hypothesis:** The call is nested inside `Promise.all(imagePages.map(async () => { callLlmWithFallback(() => { generateText() }) }))` -- several layers of generic inference. `gemini-ocr.ts` calls at the top level.
**Result:** No effect. Error moved to the extracted function but did not disappear.

### 4. Extract into a separate file with minimal imports
**Hypothesis:** `vision-reconcile.ts` imports heavy type graphs (`db` from Prisma, `Resource` from SST, `logOcrRunEvent` from `@mcp-gcse/db`). These push the type environment near the limit before `Output.object` resolves. `gemini-ocr.ts` has minimal imports.
**Result:** No effect. Error appeared in the new file.

### 5. Wrap schema with `zodSchema()` helper from AI SDK
**Hypothesis:** `zodSchema()` returns a pre-resolved `Schema<T>` type, short-circuiting Zod inference.
**Result:** No effect. `zodSchema()` itself triggered TS2589.

### 6. Store `Output.object(...)` in a variable before passing to `generateText`
**Hypothesis:** Breaking the assignment boundary stops inference flowing through `generateText`'s complex generics.
**Result:** No effect. Error moved to the variable assignment.

### 7. Change `moduleResolution` from `"bundler"` to `"nodenext"`
**Hypothesis:** Known Zod v4 issue -- `bundler` resolution loads Zod declarations through multiple paths causing duplicate structural comparisons. `nodenext` avoids this.
**Result:** TS2589 disappeared. But `nodenext` requires `.js` extensions on all imports and `module: "NodeNext"` -- too invasive a change for the whole backend package.

### 8. `@ts-expect-error` suppression
**Result:** Works, but user rejected this as a band-aid.

## Key findings from the investigation

### The `--generateTrace` discovery
Running `tsc --generateTrace` on the full backend revealed that `create-test-dataset/tool.ts` was taking **14 seconds** to typecheck (40x slower than any other file). The cause was `role: "system"` inside the `messages` array rather than as a top-level `system` prop on `generateText()`. This forced TypeScript into expensive union type resolution on the AI SDK's `Prompt` type. This was fixed.

### Backend typecheck OOM
The full backend `bun typecheck` crashes with **JavaScript heap out of memory** (4GB limit hit after ~230 seconds). This is likely caused by the cumulative cost of resolving `Output.object` generics across all call sites. The `create-test-dataset` fix (14s -> fast) should help, but the overall OOM may need more investigation.

### `moduleResolution` is the root cause
The Zod v4 + AI SDK TS2589 issue is documented:
- [vercel/ai#7724](https://github.com/vercel/ai/issues/7724)
- [colinhacks/zod#4984](https://github.com/colinhacks/zod/issues/4984)
- [vercel/ai#10014](https://github.com/vercel/ai/issues/10014)

The fix is `moduleResolution: "nodenext"`, which prevents TypeScript from loading Zod's `.d.ts` files through multiple module resolution paths. With `"bundler"`, TypeScript performs expensive structural comparisons on what are logically the same types loaded via different paths.

## Why only `vision-reconcile.ts`?

Still unclear. Every hypothesis about what makes this file unique (imports, nesting, schema complexity, cross-module schema) was disproven. The error may depend on file processing order, cumulative type cache state, or a threshold that this file narrowly exceeds while others narrowly avoid.

## Future approaches

1. **Migrate to `moduleResolution: "nodenext"`** -- This is the proper fix. Would require adding `.js` extensions to all backend imports and setting `module: "NodeNext"`. Could be done incrementally or with a codemod (`fix-esm-import-path` or similar). This would fix both the TS2589 and likely the OOM.

2. **Wait for upstream fix** -- Zod v4 and AI SDK are both actively working on this. A future version of either may resolve it without config changes.

3. **Use `generateObject` instead of `generateText` + `Output.object`** -- Different code path in the AI SDK that may not trigger the same inference depth. Would need testing.

4. **Run `--generateTrace` to completion** -- The trace we ran was interrupted. A full trace with 8GB heap (`NODE_OPTIONS="--max-old-space-size=8192"`) would show which files/types consume the most time and memory, helping identify all bottlenecks (not just `create-test-dataset`).

5. **Profile with `--extendedDiagnostics`** -- `tsc --noEmit --extendedDiagnostics` shows total check time, memory usage, and type count. Useful for before/after comparison when testing fixes.

6. **Isolate with `--explainFiles`** -- `tsc --explainFiles` shows why each file is included and through which resolution path. Could reveal if Zod types are being loaded multiple times.
