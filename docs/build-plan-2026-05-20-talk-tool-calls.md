# Build plan — Talk to DeepMark tool calls (annotations + teacher-override)

**Date:** 2026-05-20
**Owner:** Stuart
**Status:** **Core feature delivered (2026-05-20); cleanup pass pending — see "Cleanup hit list" at the bottom.**
**Related:**
- Builds on shipped Phase 1+2+5 of Talk to DeepMark (commits `9319b72`, `a0e5d65` on `main`)
- Precedes `docs/build-plan-2026-05-20-talk-conversation-persistence.md` (persistence lands AFTER this so the persisted `UIMessage[]` shape includes real tool-call parts)
- Pulls into scope what the original Talk to DeepMark plan called Phase 3 + Phase 4

## Progress (as of 2026-05-20)

**Delivered (pushed to `origin/main`):**

| Commit | What landed |
|---|---|
| `7d1797f` | Pass A — tool Zod schemas, signal↔mark mapping, system-prompt tools section, selection signal threading |
| `e0471e3` | Pass B — annotation helpers (phrase-match), `onToolCall` dispatcher, `EditorHandleProvider`, inline status pills, `linkToScan` via CustomEvent. Override card deferred. |
| `bf44b7c` | Refactor — dropped the token-range addressing path entirely; phrase-only annotations. -558 lines net. |
| `bb2aea6` | Fix — added `_questionId: <uuid>_` line under each question heading in the preamble; tightened prompt rules (ignore colour words, map "neutral" → underline, contiguous single line). |
| `4801a32` | Override confirm card — `proposeTeacherOverride` re-registered; `OverrideConfirmCard` component; ChatPanel wires `upsertTeacherOverride` mutation. |

**End-to-end working today:**
- Teacher highlights text → "Talk to DeepMark" → chip in chat → DeepMark sees `<selection>` with phrase, question number, question id.
- DeepMark can `addAnnotation` / `updateAnnotation` / `removeAnnotation` by phrase (exact match in the student's answer, single-occurrence required).
- DeepMark can `linkToScan` → SubmissionView listens, scrolls the question into view.
- DeepMark can `proposeTeacherOverride` → inline card with Accept/Dismiss; Accept fires the existing override mutation.
- Conversation has no persistence (refresh wipes). That's the next build plan.

**Known gap:** the cleanup hit list below — accumulated technical debt before staff review.

## Context

Talk to DeepMark is currently a read-only assistant. It sees the full submission context (questions, mark schemes, marking decisions, annotations) but can't modify anything. The next leap is letting DeepMark **act** — add/update/remove annotations on the script and propose teacher-override score changes — driven by conversational requests like "annotate this line as a tick for AO2 strong with the comment 'good use of evidence'" or "I think this answer deserves 8 marks not 6, can you suggest that as an override?"

Why client-executed tools, not server-side: the editor is a Yjs-backed ProseMirror doc; annotation marks live on PM positions resolved from OCR token IDs. The token-ID-to-PM-position mapping is a client concern (lives in `useQuestionAlignments` + `pmPosToCharInBlock`). Doing the writes server-side would mean either headless-PM on Lambda or going through Yjs from the server — both heavier than streaming structured tool calls and applying them via existing client helpers.

## Locked decisions (from today's conversation)

1. **Teacher-override surfaces as a confirm card in the chat, not direct apply.** DeepMark calls `proposeTeacherOverride`; an inline card renders in the conversation with the proposed score change and reasoning; the teacher clicks **Accept** to fire the existing override mutation. Decline is also a button. The model is told via the deferred tool result whether the change went through.
2. **No new mark types.** DeepMark picks from the existing 6 `MARK_SIGNAL_NAMES` (`tick`, `cross`, `underline`, `double_underline`, `box`, `circle`) and the existing `ao_category` / `ao_quality` / `ao_display` vocabulary on `AnnotationPayload`. The schema doesn't grow.
3. **Annotation writes apply directly** (no confirm card per annotation — they're cheap, reversible via the existing eraser, and asking the teacher to confirm every tick destroys flow). Teacher override is the exception because it changes the headline mark.
4. **Phrase-match is the only addressing mechanism for annotations.** Model emits `phrase: string` — the exact text it wants to annotate — and we do an **exact** (not fuzzy) string search inside the question's `student_answer`. **Per CLAUDE.md: exact match is not fuzzy match — phrase-match here is on safe ground.** Token-range was considered and rejected — opaque token IDs add complexity for no real benefit; the model has the full student answer in the preamble and can quote from it.
5. **Comment sidebar stays silent on DeepMark-applied marks.** The existing `onMarkApplied` activation (which the teacher's own toolbar / shortcut clicks trigger) is NOT fired by the tool dispatcher. Lets DeepMark batch multiple annotations in one turn without UI flicker.
6. **Single-undo grouping for batched tool calls.** When the model emits N annotation tool calls in one turn, the client dispatches them as one PM history entry (via `tr.setMeta("addToHistory", false)` on intermediate transactions, history-on for the final one). Teacher hits Ctrl+Z once → all N marks undone.

## Goal

Let DeepMark mutate the doc in three modes:
- **Annotations** — add, update, remove. Direct apply (no confirm).
- **Teacher overrides** — propose only. Confirm card in the conversation; teacher accepts to commit.
- **Navigation** — `linkToScan` to scroll the scan view to a token range. UI side-effect only.

Plus the per-turn selection signal must carry token IDs (not just text + question number) so DeepMark can reference the exact span the teacher highlighted when composing tool calls.

## Non-goals

- New mark signals or AO vocabulary. Locked above.
- Per-AO teacher overrides. Today's override is total-score-only on a question; DeepMark proposes the same shape.
- Chains (the `chain` overlay type for connective phrases). Tools cover the `annotation` overlay only; chains are AI-pipeline-only for now.
- Server-side ProseMirror editing. All applies happen client-side after the LLM emits the tool call.
- Audit log of which annotations DeepMark created. The existing `source: "teacher"` attr is the only distinction we keep; "applied via chat" vs "applied via shortcut" is not tracked.
- Annotation eval suite changes. DeepMark-applied annotations go through the same projection path as teacher-applied ones; no new eval is required.

## Tool surface (Zod schemas)

Annotation address is a verbatim phrase. The student answer is verbatim in the preamble so the model can quote it precisely.

### `addAnnotation`

```ts
z.object({
  questionId: z.string(),
  phrase: z.string().min(1),  // exact text to match within the question's student_answer
  signal: z.enum(["tick", "cross", "underline", "double_underline", "box", "circle"]),
  reason: z.string().min(1), // examiner-style short note — REQUIRED on AnnotationPayload
  comment: z.string().optional(),
  ao_category: z.string().optional(),   // "AO1", "AO2", ...
  ao_display: z.string().optional(),    // board-specific label
  ao_quality: z.enum(["strong", "partial", "incorrect", "valid"]).optional(),
  label: z.string().max(20).optional(), // short marginal label e.g. "3/4"
})
```

### `updateAnnotation`

```ts
z.object({
  annotationId: z.string(),
  signal: z.enum([...]).optional(),
  comment: z.string().optional(),
  ao_category: z.string().optional(),
  ao_display: z.string().optional(),
  ao_quality: z.enum(["strong", "partial", "incorrect", "valid"]).optional(),
  label: z.string().max(20).optional(),
})
```

### `removeAnnotation`

```ts
z.object({ annotationId: z.string() })
```

### `proposeTeacherOverride`

```ts
z.object({
  questionId: z.string(),
  suggestedScore: z.number().int().min(0),
  reason: z.string().min(1), // shown on the confirm card AND fed to the existing override row's `reason` field on accept
})
```

### `linkToScan`

```ts
z.object({
  questionId: z.string(),
  tokenStart: z.string().optional(),
  tokenEnd: z.string().optional(),
})
```

## Server side — tool definitions, no `execute`

`apps/web/src/lib/talk/tools.ts` (new):

- Exports `buildTalkTools(submissionId?)` returning an object keyed by tool name with `inputSchema` only. No `execute` function — the AI SDK passes the tool call through the stream and the client resolves it via `onToolCall` + `addToolResult`.
- Tools are only registered when `submissionId` is present. General-assistant mode (dashboard, `/teacher/talk`) sees the same system prompt minus the tools section.
- The route's `streamText` call gains `tools: buildTalkTools(submissionId)` and `toolChoice: "auto"` (default).

## Client side — `onToolCall` wiring

`apps/web/src/components/talk/talk-to-deepmark-chat.tsx`:

- The component currently mounts `useChat({ transport, onError })`. Extend to `onToolCall: async ({ toolCall }) => …` plus optionally `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` from the AI SDK so the next turn fires automatically once tool results land.
- Tool dispatch is delegated via callback props the parent (`ChatPanel`) supplies:
  - `onAddAnnotation({ questionId, tokenStart, tokenEnd, ... }) => Promise<{ ok: true, annotationId } | { ok: false, reason: string }>`
  - `onUpdateAnnotation({ annotationId, ... }) => Promise<{ ok, reason? }>`
  - `onRemoveAnnotation({ annotationId }) => Promise<{ ok, reason? }>`
  - `onLinkToScan({ questionId, tokenStart?, tokenEnd? }) => void` — fire-and-forget UI event
  - `onProposeOverride({ questionId, suggestedScore, reason, toolCallId }) => Promise<{ accepted: boolean, reason?: string }>` — returns a Promise resolved by the confirm card's button click
- After the callback resolves, call `addToolResult({ toolCallId, output: <result> })` so the model can react (and try again if it failed).

### Confirm-card UX for `proposeTeacherOverride`

This is the trickiest piece. Two ways the AI SDK supports human-in-the-loop:

1. **`tool.needsApproval`** flag → the SDK suspends the tool call and the client must call `addToolApprovalResponse({ id, approved })`. Cleanest if the SDK version supports it.
2. **Render the tool call as an in-conversation UI part** → custom message-part rendering reads `tool-*` parts off the message stream and shows the confirm card; the click handler calls `addToolResult` with the resolved decision.

Recommend #2 — gives full control over the card's visuals (Tailwind, design tokens, existing `<Button variant="confirm">` for accept). Lock the exact API at build time after a quick read of the installed `ai` package version.

The confirm card renders inside the message bubble flow:

- Headline: "Suggested override — Q3"
- Body: "Change from <current>/8 to <suggested>/8 — <reason>"
- Buttons: `Accept change` (variant="confirm") · `Dismiss`
- After click: card collapses into a compact "Accepted" / "Dismissed" line (so chat history reads cleanly later).

On Accept: fire the existing `upsertTeacherOverride` server action with `{ submissionId, questionId, score_override: suggestedScore, reason }`. On success, `addToolResult({ accepted: true })`. On failure (rare; authz or DB), `addToolResult({ accepted: false, reason: "Failed to apply override: …" })` and toast.

On Dismiss: `addToolResult({ accepted: false, reason: "Teacher dismissed the suggestion." })`.

## Selection signal upgrade — token IDs

For DeepMark to reference the highlighted span when calling `addAnnotation`, the chat needs to carry the token range, not just `{ text, questionNumber }`. Three touchpoints:

1. **`onAskDeepMark` payload** in `annotated-answer-sheet.tsx`: extend to `{ text, questionId, tokenStart, tokenEnd }`. Resolve at click time using `pmPosToCharInBlock` against the enclosing `questionAnswer` block + the `TokenAlignment.tokenMap` for that question — find tokens whose char range contains the selection's `[from, to]`.
2. **`Prefill` / chip state** in `chat-panel.tsx` + `TalkToDeepMarkChat`: carry `questionId`, `tokenStart`, `tokenEnd` alongside `text` and `questionNumber`.
3. **`selection` body** in `/api/talk` route: existing Zod schema accepts the new optional fields. The selection wrapper now becomes `<selection question="Q3" tokens="t_4f2..t_4f9">…text…</selection>` so the model has both human-readable and machine-referenceable handles.

If the selection spans multiple questions or the alignment can't resolve token ids (rare — selection ends in punctuation between tokens), fall back to text-only. The model can ask the teacher to re-select if it needs token granularity.

## Tool routing — where each tool gets executed

| Tool | Where the work happens | Why |
|---|---|---|
| `addAnnotation` | Client. Resolves token IDs → PM positions via the alignment hook, calls `applyAnnotationMark(editor, { ... })`. Yjs sync handles persistence. | Existing helper covers it; server-side would need headless PM. |
| `updateAnnotation` | Client. Finds the existing mark by `annotationId` attr in the PM doc, updates its payload via a PM transaction. | Same reason. |
| `removeAnnotation` | Client. PM transaction that removes the mark by annotationId. | Same. |
| `proposeTeacherOverride` | Client renders confirm card → on accept, calls the existing `upsertTeacherOverride` server action. | The DB write is server-side (already exists); the confirm-flow is client. |
| `linkToScan` | Client. Fires an event the editor's scan-panel listens to (scroll into view). | Pure UI. |

## Change scope

### 1. Tool definitions

- `apps/web/src/lib/talk/tools.ts` (new) — `buildTalkTools(submissionId?: string)` exports tool definitions with Zod schemas.
- `apps/web/src/lib/talk/__tests__/tools.test.ts` — Zod schemas validate sample inputs; no logic to test beyond that.

### 2. Route changes

- `/api/talk/route.ts` — pass `tools: buildTalkTools(submissionId)` and `toolChoice: "auto"` to `streamText`. Selection schema extends to accept `questionId`, `tokenStart`, `tokenEnd`. Update `formatUserMessageWithSelection` to render the richer `<selection question="..." tokens="...">…</selection>` form.

### 3. System prompt update

- `apps/web/src/lib/talk/system-prompt.ts` — add a "Tools" section to `TALK_SYSTEM_PROMPT` describing each tool, when to use it, and the convention for signal selection (e.g. "use `tick` when a mark point is met; `cross` when explicitly wrong; `underline` for highlighted phrases; etc."). Crucially: the prompt should tell the model NOT to call `addAnnotation` reflexively after every comment — only when the teacher explicitly asks, or when adding a mark is the obvious response to a request like "annotate that".
- New rule for `proposeTeacherOverride`: "Only propose an override when the teacher explicitly disputes a mark or signals they think the score is wrong. Never propose unsolicited overrides."

### 4. BubbleMenu + selection upgrade

- `apps/web/src/components/annotated-answer/annotated-answer-sheet.tsx` — `onAskDeepMark` payload gains `questionId`, `tokenStart`, `tokenEnd`. Token IDs are resolved at click time using the existing alignment hook (passed in via `alignmentByQuestion`) and `pmPosToCharInBlock`.
- `apps/web/src/lib/marking/alignment/segments.ts` or a sibling — new pure helper `resolveTokenRange(selection: { from, to }, blockAttrs, tokenMap): { tokenStart: string, tokenEnd: string } | null`. Test in `__tests__/`.

### 5. Selection threading through `submission-view.tsx` and `ChatPanel`

- `submission-view.tsx`'s `chatPrefill` state and `askDeepMark` callback gain the token-id fields.
- `ChatPanel` passes the enriched prefill to `TalkToDeepMarkChat`.
- `TalkToDeepMarkChat`'s `Prefill` type and chip state carry token ids; the chip badge UI is unchanged (the tokens are invisible to the teacher).
- The per-call `body` extends to `{ selection: { text, questionId, tokenStart, tokenEnd, questionNumber } }`.

### 6. Client tool execution

- `apps/web/src/components/talk/talk-to-deepmark-chat.tsx`:
  - Accept five new optional callback props: `onAddAnnotation`, `onUpdateAnnotation`, `onRemoveAnnotation`, `onLinkToScan`, `onProposeOverride`.
  - Add `onToolCall` handler that dispatches on `toolCall.toolName` and calls the appropriate callback.
  - Render `tool-*` parts off the message stream — annotation tools render a compact "✓ added annotation" line; `proposeTeacherOverride` renders the full confirm card.
- `ChatPanel`:
  - Builds the callbacks using the editor instance (passed in or via a ref), the existing `applyAnnotationMark` helper, the alignment data, and a `usePropOverrideConfirm` hook that mediates the confirm card's accept/decline.

### 7. Annotation apply path

- `apps/web/src/components/annotated-answer/apply-annotation-mark.ts` already exists and is the right entry point. Add a sibling helper `applyAnnotationByTokenRange(editor, { questionId, tokenStart, tokenEnd, payload })` that resolves the token range to PM positions via the alignment and then calls `applyAnnotationMark`. Pure-ish — depends on the alignment data; testable with a fixture.
- `updateAnnotation` and `removeAnnotation` need new helpers: `updateAnnotationById(editor, annotationId, payloadPatch)` and `removeAnnotationById(editor, annotationId)`. Both walk the PM doc, find the mark with matching `annotationId` attr, and dispatch a transaction.

### 8. Confirm card

- `apps/web/src/components/talk/tool-confirm-card.tsx` (new) — single component renders the `proposeTeacherOverride` card. Takes the parsed tool input + accept/decline callbacks. Once a decision is made, the card transitions to a collapsed "Accepted" / "Dismissed" state and stays in the chat history.

### 9. Unit + integration tests

- Pure helpers: `resolveTokenRange`, `applyAnnotationByTokenRange` (with mock editor), `updateAnnotationById`, `removeAnnotationById`.
- Schema validation: every tool's Zod schema rejects bad input.
- Confirm card: the accept callback fires the override mutation with the right args; decline emits the right tool result. Lightweight RTL test.
- No new LLM evals — tool calls are a UX feature, not a marking-accuracy feature.

## Order of operations

| Step | Risk | Effort |
|---|---|---|
| 1. Tool Zod schemas + tests | Low | 30 min |
| 2. System-prompt addendum (tool descriptions, when-to-use rules) | Low | 30 min |
| 3. Selection token-id resolution at BubbleMenu click + threading through to chat | Medium | 90 min |
| 4. Route wires tools into `streamText`; selection schema extended; selection wrapper carries tokens | Low | 30 min |
| 5. Client `applyAnnotationByTokenRange` + `updateAnnotationById` + `removeAnnotationById` helpers with tests | Medium | 90 min |
| 6. `onToolCall` dispatcher + the four annotation-tool callbacks in ChatPanel | Medium | 60 min |
| 7. `tool-confirm-card.tsx` + override accept-flow wiring; render tool parts inline in the chat | Medium-High | 120 min |
| 8. `linkToScan` event + scan-panel listener | Low | 30 min |
| 9. End-to-end smoke: ask "tick this for AO2 strong" → mark appears + Yjs syncs; ask "suggest 8/8 not 6/8" → card appears, accept applies override | Medium | 60 min |

**Total estimate: 6-9 hours focused work, plus LLM cost for end-to-end testing (a couple of dollars).**

## Acceptance criteria

1. **Add via chat.** Highlight a sentence in the editor; "Talk to DeepMark" → chip captures text + token ids; ask "annotate this as a tick for AO2 strong with comment 'good evidence'". The mark appears in the doc within ~1s of the model finishing the tool call; the comment sidebar shows it; Yjs syncs to another browser tab.
2. **Update via chat.** Ask DeepMark "change the comment on the last annotation to 'still needs more analysis'". The existing mark's payload comment updates; UI re-renders.
3. **Remove via chat.** Ask "remove that annotation" referring to the last one. The mark disappears.
4. **Override confirm card.** Ask DeepMark "I think this is worth 8 not 6, suggest an override". A card appears in the conversation with the proposed change. Click **Accept** → existing override row written to `teacher_overrides`; the editor's score chrome updates; card collapses to "Accepted". Click **Dismiss** on a different proposal → card collapses to "Dismissed" without DB write; model is told.
5. **Unsolicited override blocked.** Ask a neutral question like "what did the student do well?". DeepMark does NOT call `proposeTeacherOverride` — it answers in prose. (Prompt rule enforced.)
6. **No new mark types.** All `addAnnotation` calls validate against the existing 6-signal enum; invalid signals get rejected at the Zod boundary; model can self-correct in the next turn.
7. **General-assistant mode unaffected.** Open dashboard "Ask anything"; tool calls are not exposed; DeepMark answers in plain prose.
8. **Inaccessible selection.** Selection that the alignment can't resolve to token ids falls back to text-only `<selection>`; DeepMark composes a response without tool calls (or asks the teacher to re-select).

## Risks and watch-outs

- **Token-id resolution edge cases.** Selections that span more than one `questionAnswer` block, or that start/end in whitespace between tokens, can't be cleanly mapped. Mitigation: `resolveTokenRange` returns `null`; the chip carries text only. Test these explicitly.
- **Yjs apply latency vs model expectation.** If the model adds an annotation and immediately tries to `updateAnnotation` on it referencing the new id, the id must be in scope. Solution: `addAnnotation`'s tool result returns the new `annotationId` so the next tool call can reference it.
- **Multiple concurrent tool calls in one turn.** The AI SDK supports parallel tool calls; in our flow each is dispatched independently. Watch for race conditions where two `addAnnotation` calls on overlapping token ranges land at the same PM position. Unlikely in practice (the model serialises naturally) but worth a real-world test.
- **Confirm card persistence across refresh.** Before persistence (Phase 2.5) ships, a refresh wipes the conversation including any unaccepted card. Acceptable for v1; after persistence lands, the `proposeTeacherOverride` tool call lives in the persisted message history, and the card's accepted/dismissed state must persist with it. Add an `output` field to the persisted tool-call part that records the decision.
- **Override confirm-card UX latency.** If the override mutation takes >500ms, the card needs a disabled "Applying…" state. Standard; just don't forget.
- **Prompt drift.** Adding tools changes how DeepMark "thinks". A model that's been answering in prose might start aggressively calling tools. Counter-balance with explicit "only call X when teacher requests" rules in the system prompt; verify with the smoke test in step 9.
- **Cost shape.** Tool-call turns cost more than text-only (the schemas are in the system prompt every turn; tool results add tokens). Prompt-caching mitigates by caching the tools-section static prefix. Expect ~15-25% higher tokens per tool turn.
- **Annotation source attribution.** All annotations DeepMark applies are tagged `source: "teacher"` — same as if the teacher applied them via the toolbar. This is deliberate (locked decision). If we ever want to distinguish "applied via chat" later, the path is a new `applied_via: "chat" | "shortcut" | "toolbar" | "ai_grader"` field; not needed now.

## Open questions (defer to implementation time)

1. **Tool registration: register on EVERY request that has `submissionId`, or only after some signal that the teacher is engaging with the editor?** Recommend: always register when `submissionId` is set. Token cost is small relative to the preamble.
2. **`needsApproval` API vs custom message-part rendering for the confirm card.** Recommend: custom rendering; gives full design control. Verify the AI SDK version supports per-message-part rendering at build time.
3. **`updateAnnotation` for AI annotations (source: "ai", from the grading pipeline)?** Recommend: allow it — DeepMark can refine AI marks too. The projection path already handles teacher edits to AI marks.
4. **Streaming feedback while the tool call is executing.** Should the chat show a "Adding annotation…" inline pill between the tool call and result? Recommend: yes, render every active tool-call part as a small inline status; collapse on completion.
5. **Tool result content visible to the model.** Should the tool result include the rendered annotation's bbox, sort_order, etc.? Recommend: keep tool result minimal — `{ ok: true, annotationId }` for adds, `{ ok: true }` for others, `{ ok: false, reason }` for failures. The model doesn't need the bbox.

## Why before persistence

- Tool-call message parts (`tool-input-*`, `tool-output-*`, `tool-approval-response`) become part of the persisted `UIMessage[]` once Phase 2.5 lands. Building tool calls first means the persistence layer serialises the real shape on day one — no retrofitting.
- Tool calls are the higher-value feature for teachers. Persistence is comfort; tools are capability.
- Persistence in isolation is straightforward to add later without re-touching tool wiring.

## Out of scope

- New mark signals beyond the existing six.
- Per-AO overrides.
- Chains (`chain` overlay type).
- DeepMark editing the question text, mark scheme, or marking_results directly.
- Tool calls for the dashboard / general-assistant mode.
- Voice / dictation input for tool requests.
- Bulk tool calls ("add ticks to every correct sentence in this answer") — Phase 6 polish if teachers ask.
- Undo/redo for DeepMark-applied annotations beyond the existing PM history (Ctrl+Z works because Yjs has undo; no special UI needed).

---

## Cleanup hit list (pre-review)

The core feature is delivered and working. Before staff review, address the
debt below. Each item is self-contained — pick them off in any order.
Aggregate effort: ~2-3 hours focused work. None are blocking the feature;
all are quality concerns a staff reviewer would flag on a first pass.

### Critical (review will stall on these)

1. **Split `talk-to-deepmark-chat.tsx` (~600 lines).** Too many responsibilities in one file. Suggested split:
   - `talk-to-deepmark-chat.tsx` — chat orchestration only (useChat, useEffect, layout, form).
   - `chat-messages/message-bubble.tsx` — `MessageBubble` + `AssistantMarkdown`.
   - `chat-messages/tool-call-pill.tsx` — generic annotation tool pill + `TOOL_LABELS`.
   - `chat-messages/override-tool-part.tsx` — `OverrideToolPart` (currently inside the main file).
   - `chat-messages/chip-badge.tsx` — selection chip.
   - `dispatch-tool-call.ts` — the `switch` + `ToolCallShape` + `ToolCallbacks` types.

2. **Replace type-cast workarounds with proper AI-SDK typing.** Three places:
   - `addToolOutput({ tool: ... as never, output: ... as never })` — should resolve by parameterising `useChat<MyUIMessage>` with a `UIMessage` typed over our tool set. Define a `TalkUIMessage = UIMessage<never, never, InferUITools<ReturnType<typeof buildTalkTools>>>` (or similar) and pass to `useChat`.
   - `message.parts.filter(...).as unknown as ToolPartShape[]` — replace with the SDK's `isToolUIPart` helper (exported from `ai`).
   - `(toolCall as { toolName?: string }).toolName` — same fix; the SDK provides typed `toolCall`.

3. **Component-level tests are zero.** Add render tests using happy-dom (already wired) for:
   - `OverrideConfirmCard` — pending → buttons; click Accept → loading state; output-available → collapsed accepted; output-available with `accepted: false` → dismissed; error state → retry-able.
   - `ToolCallPill` — pending / ok / error states render correctly with phrase preview.
   - `MessageBubble` — dispatches tool parts to the right renderer (override card vs generic pill).
   
   Pattern: same `@vitest-environment happy-dom` directive already used in `talk-tool-helpers.test.ts`.

4. **`window.dispatchEvent("deepmark:link-to-scan")` for navigation.** Invisible coupling between ChatPanel and SubmissionView via global event listener. Replace with a small React context — `LinkToScanProvider` mounted at SubmissionView with a `useLinkToScan()` consumer in ChatPanel. Same one-listener-and-one-emitter pattern, just in-tree.

### Worth fixing (small wins)

5. **Single ref-bag instead of four parallel refs.** Currently `addAnnRef`, `updateAnnRef`, `removeAnnRef`, `linkScanRef` each updated separately in `talk-to-deepmark-chat.tsx`. Combine into one `callbacksRef = useRef({ ... })` updated on every render.

6. **Override mutation failure → tool result.** Today, when the override mutation fails, we keep the tool call in `input-available` state and show the error via React `useState`. Cleaner: write the failure to `addToolOutput({ output: { accepted: false, reason: "Mutation failed: …" } })` so the model also learns about it. The card derives its visible state from the SDK part state, no local error tracking needed.

7. **Fix HardBreak handling properly; remove the "single line" prompt rule.** `pmPosToCharInBlock` treats `HardBreak` as 0 chars. So a phrase quoted across a line break in the student's answer fails the exact match — I papered over this with a prompt rule ("contiguous single line"). The right fix: in `applyAnnotationByPhrase`, walk the block inserting `"\n"` for HardBreak nodes when building the search target, and write a matching `charToPmPosInBlock` variant that consumes HardBreaks as 1 char. Then delete the prompt rule.

8. **`signalToMarkName` exhaustiveness.** The switch has a default-less return type that lets new signals slip through silently. Fix with explicit return-type narrowing or `const _exhaustive: never = signal` after the switch.

9. **Split `talk-tool-helpers.ts`** into:
   - `talk-tool-pure.ts` — `findQuestionBlock`, `charToPmPosInBlock`, `findAnnotationRange` (no editor dispatch).
   - `talk-tool-actions.ts` — `applyAnnotationByPhrase`, `updateAnnotationById`, `removeAnnotationById` (editor-mutating).

### Subjective / could go either way

10. **Wrap `db.markScheme.findMany` in a server action** for consistency with the rest of the codebase. Currently inline in `/api/talk/route.ts`. The user is already viewer-authz'd, so it's safe, but it's an outlier compared to every other DB read in the codebase which goes through a resourceAction.

11. **Prompt rule sprawl needs a chat eval suite.** Three behaviour patches in the system prompt so far ("ignore colour words", "neutral → underline", "contiguous single line"). Each is fine; together they're a growing list. Long-term we need a way to assert chat behaviour without re-discovering issues in production. Not a near-term blocker.

12. **`OverrideToolPart` derives card state twice** — once when computing the `state` prop, once inside `OverrideConfirmCard` (the `isApplying` local state). Consolidate by making the card take `part: ToolPartShape` directly and deriving state inside.

### Out of scope for this cleanup

- Conversation persistence — has its own build plan (`docs/build-plan-2026-05-20-talk-conversation-persistence.md`).
- Bulk tool calls (`addAnnotation` × N).
- `@`-mention autocomplete UI for cross-submission references.

## Order of operations for the cleanup

| Step | Items | Risk | Effort |
|---|---|---|---|
| 1. Split files (`talk-to-deepmark-chat.tsx`, `talk-tool-helpers.ts`) | #1, #9 | Low — pure code movement | 60 min |
| 2. Replace casts with proper typing | #2 | Medium — wrestling with AI SDK generics | 45 min |
| 3. Add component tests | #3 | Low | 60 min |
| 4. `LinkToScanProvider` context | #4 | Low | 20 min |
| 5. Ref-bag refactor | #5 | Low | 10 min |
| 6. Override-failure tool result | #6 | Low | 15 min |
| 7. HardBreak phrase-matching | #7 | Medium — touches load-bearing token mapping; needs a new test | 45 min |
| 8. `signalToMarkName` exhaustiveness | #8 | Trivial | 5 min |
| 9. Wrap `db.markScheme.findMany` in action | #10 | Low | 20 min |

**Total: ~4-5 hours.** Items 1-6 are the must-haves before staff review; 7-9 are bonus polish.

## Acceptance criteria for the cleanup

- `talk-to-deepmark-chat.tsx` < 200 lines (orchestration only).
- Zero `as never` / `as unknown as ToolPartShape` casts in the chat surface.
- Component tests cover `OverrideConfirmCard` (4 states), `ToolCallPill` (3 states), `MessageBubble` (dispatch logic).
- No `window.dispatchEvent` in the talk surface.
- `bun test:unit` + `bun typecheck` + `bun check` (biome) all green on touched files.
- Prompt rule "Quote a contiguous run from a single line" deleted; phrase-matching handles HardBreaks correctly.
- Build plan updated to mark the cleanup as Delivered with the resulting commit hash.
