# Build plan — Talk to DeepMark conversation persistence

**Date:** 2026-05-20
**Owner:** Stuart
**Status:** Proposed — deferred behind tool-calls (Phase 3+4 of the original Talk to DeepMark plan)
**Related:**
- Builds on shipped Phase 1+2+5 of Talk to DeepMark (commits `9319b72`, `a0e5d65` on `main`)
- Sits BEFORE this in priority: Phase 3+4 — DeepMark-driven annotations + teacher-override tool calls
- Loosely related: `docs/build-plan-2026-05-19-grading-payload-db-persistence.md` (no direct dependency; both touch persistence but for different reasons)

## Context

Talk to DeepMark currently has zero persistence — conversation state lives in `useChat`'s React memory only. Refresh wipes everything. That was deliberate for the first ship; persistence was scoped as "Phase 2.5" in the original plan with a placeholder schema of `TalkConversation { submission_id, user_id, messages JSONB }` keyed `(submission_id, user_id)`.

That schema turned out to be the wrong shape. Reasoning surfaced during conversation:

- Talk to DeepMark is intended to be an **omnipresent** assistant (memory: `project_talk_to_deepmark.md`), not an editor-only surface. The dashboard "Ask anything" pill already uses it; `/teacher/talk` is a standalone page.
- A single conversation can naturally reference **multiple** submissions — teacher asks "how does this script compare to Aaron's?", drops a URL, or `@`-mentions another student. Pinning a conversation to one `submission_id` makes that flow awkward.
- "Which submission is primary?" becomes arbitrary the moment a conversation references two.
- ChatGPT-style cross-surface continuity (start a thread in the editor, continue it on the dashboard) is the affordance teachers expect.

The right decomposition: **conversations are user-owned; submissions are things a conversation references via a join table.** "Resume my last conversation about this script" becomes a query against the join, not a schema constraint.

## Goal

Land a conversation-persistence layer that:

1. Persists every Talk to DeepMark conversation across refreshes, devices, and surfaces.
2. Supports a single conversation referencing zero, one, or many submissions over its lifetime.
3. Resumes the most relevant conversation when the chat is opened (most-recent-for-submission in the editor; most-recent-overall on the dashboard).
4. Surfaces past conversations via a history popover and lets the teacher explicitly start a new conversation via a `+` button.
5. Handles authz at read time, not at write time — a conversation that referenced a now-inaccessible submission stays intact in history; just the preamble for that submission is dropped on the next turn.

## Non-goals

- Search across conversations. List + select is enough; full-text search waits until teachers ask.
- LLM-generated conversation titles. Use a first-user-message snip; revisit later if titles read poorly in the sidebar.
- Conversation sharing between users. Single-user-scoped only.
- Edit/delete of historical messages. Append-only; teacher can delete a whole conversation but not mutate turns.
- @-mention autocomplete UI in the textarea (the *server-side* multi-submission preamble loading IS in scope; the client-side `@` autocomplete is a follow-up).
- Migrating in-flight in-memory conversations from before this lands. Pre-launch; no users; they evaporate cleanly.

## Schema design

Per `CLAUDE.md` no-grandfathering: ship the right shape now. Two new Prisma models:

```prisma
model TalkConversation {
  id          String   @id @default(cuid())
  user_id     String
  user        User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  title       String?  // first user-message snippet, ~60 chars, auto-generated on first send
  model       String   // e.g. "claude-sonnet-4-6" — audit/replay
  messages    Json     // AI-SDK UIMessage[] shape, NOT flattened {role,content}
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  submissions TalkConversationSubmission[]

  @@index([user_id, updated_at(sort: Desc)])
  @@map("talk_conversations")
}

model TalkConversationSubmission {
  conversation_id     String
  submission_id       String
  first_referenced_at DateTime @default(now())

  conversation TalkConversation  @relation(fields: [conversation_id], references: [id], onDelete: Cascade)
  submission   StudentSubmission @relation(fields: [submission_id], references: [id], onDelete: Cascade)

  @@id([conversation_id, submission_id])
  @@index([submission_id, first_referenced_at(sort: Desc)])
  @@map("talk_conversation_submissions")
}
```

**Why `messages` as JSONB and not a normalised `TalkMessage` table:**
- A conversation is a list-of-messages-as-a-unit; we never query *into* a turn.
- Mutations are append-only.
- AI-SDK `UIMessage[]` has a variable nested shape (parts array, tool-call parts, tool-result parts when Phase 3+4 lands). JSONB absorbs that without schema churn.
- The persisted shape MUST be the full `UIMessage[]` (with `parts`), not a flattened `{role, content}`. We need tool-call state preserved for resume after Phase 3+4.

**Why a separate join table and not a `submission_id String[]`:**
- We need `first_referenced_at` per submission for "earliest-referencing conversation" lookups.
- We need `WHERE submission_id = X` indexed lookups for the editor's "most recent conversation in this script" query. An array column doesn't index this efficiently.
- Cascade-delete behaviour is honest — deleting a submission removes the join rows, not the conversation.

**Indexes:**
- `talk_conversations(user_id, updated_at desc)` — drives the global history popover and the dashboard auto-resume lookup.
- `talk_conversation_submissions(submission_id, first_referenced_at desc)` — drives the editor's per-submission auto-resume lookup.

## Behaviour decisions (locked)

### Auto-resume on chat mount

- **Editor surface** (`ChatPanel` inside the submission view): on mount, query the most recent `TalkConversation` whose join includes this `submission_id`. If `updated_at` is within **24 hours**, attach to it. Otherwise start a blank new conversation. Teacher can pull any older conversation from the history popover.
- **Dashboard / `/teacher/talk`**: on mount, query the user's most recent conversation overall. No freshness cap (the user is explicitly returning to chat; resume whatever they last had open).
- The current conversation is **determined at mount time by the surface's context**. Manual override via history-click or `+`-click sticks until the next remount.

### "Single conversation keeps going until +"

- Within a single surface mount, the chat attaches to one `conversationId` and stays there. Every send appends to that conversation's `messages` JSONB.
- `@`-mentioning another submission mid-conversation adds a row to the join table (idempotent on primary key) but keeps the same conversation.
- Clicking `+` clears local `useChat` state and detaches from the current conversation. We **do NOT** write a new DB row until the first message of the new conversation actually sends — lazy create avoids empty rows from stray `+` clicks.

### History popover

- Anchored right under the clock icon; ~280px wide; scrollable list.
- Each row: title (truncate at ~40 chars) + 1–2 submission chips ("Q3 — Aaron Brown") + relative timestamp.
- Click → switch the chat to that conversation. If the conversation references submissions the user no longer has access to, those chips are greyed out and the row remains clickable; the preamble loader handles inaccessible submissions on the next turn (see "Authz at read time" below).
- Order: `updated_at desc`. Pagination not needed initially (load latest 50; "Load more" if the list grows).
- Empty state: short "No past conversations yet" placeholder.

### `+` (new conversation)

- Same icon-button styling as the history clock; sits next to it on the right of the surface's header bar.
- Clears local state, detaches `conversationId`. UI returns to the empty / suggestions state.
- DB write happens on first send, not on `+` click.

### Title generation

- First user message → trim → collapse whitespace → take first ~60 chars → trailing `…` if truncated.
- Written once on the first `onFinish` of a brand-new conversation; never recomputed.
- LLM-summarised titles can come later as a one-shot batch refresh if user feedback says snips read poorly.

### Authz at read time

- Conversations are user-scoped (FK `user_id`).
- The preamble loader re-checks access per submission on every turn — silently drops submissions the user can't see, prepends a one-line system note to that turn: `[Notice: submission "<title>" is no longer accessible — context excluded.]`.
- Conversation history (the messages JSONB) is never redacted post-hoc.
- The "submission chips" in the history popover are derived from the join + a per-render `accessWhere` check on the submission FK; inaccessible ones grey out.

## Change scope

### 1. Prisma schema + db push

`packages/db/prisma/schema.prisma` — add the two models above plus the inverse relation `User.talk_conversations`. Push via `bun db:push` (project doesn't use Prisma Migrate).

### 2. Server actions

New file `apps/web/src/lib/talk/conversations/` (nested per the domain-module convention) with:

- `queries.ts`
  - `getRecentConversationForSubmission({ submissionId }) → TalkConversation | null` — `authenticatedAction` + per-submission viewer authz inside.
  - `getRecentConversationGlobal() → TalkConversation | null` — `authenticatedAction`, scoped to current user.
  - `listConversations({ limit, before? }) → TalkConversation[]` — `scopedAction`, paginated by `updated_at`. Includes a small `submissionRefs: { id, student_name, exam_paper_title }[]` per row for chip rendering.
- `mutations.ts`
  - `appendConversationTurn({ conversationId?, messages, submissionRefs })` — `authenticatedAction`. On null `conversationId`, creates a row (lazy create). Inserts join rows for any `submissionRefs` the conversation hasn't touched yet (idempotent on PK). Returns the resolved `conversationId` so the client can pin to it.
  - `deleteConversation({ conversationId })` — `authenticatedAction`, user-scoped delete; cascades the join rows.

Two open questions worth resolving when this is built:

- **Title write path** — does `appendConversationTurn` set the title on create, or is title set by a separate `onFinish` callback after the first user turn? Recommend: set on create, derived from the first user message in the `messages` payload. One round-trip.
- **Concurrent writes** — if the same user has the chat open on two tabs and sends concurrently, the JSONB write races. Recommend: pessimistic — `appendConversationTurn` reads the row, validates `messages.length === expectedTurnCount`, and 409s on mismatch. Client retries by refetching. Detail to lock when building.

### 3. Route handler — load + append

`apps/web/src/app/api/talk/route.ts`:

- Input shape extends to `{ conversationId?, submissionId?, mentionedSubmissionIds?, selection?, messages }`. `messages` from `useChat` already includes the full history client-side; we use the client-provided history for the LLM call and persist it server-side via `appendConversationTurn` in the `streamText` `onFinish` callback.
- After `streamText` finishes, write the full message list (user turn + assistant turn) to the DB via `appendConversationTurn`. The returned `conversationId` is shipped to the client via a custom UI-stream chunk (Vercel AI SDK supports `streamData.append({ conversationId })`).
- `submissionId` (primary, from the editor) and `mentionedSubmissionIds` (from any client-side @-mentions, plus any server-detected URL references — defer URL parsing if time-pressured) collectively become the preamble's submission set. Each is authz'd independently; failures get the system-note treatment.

### 4. Client — `TalkToDeepMarkChat` changes

- New optional prop: `conversationId?: string`. When provided, `useChat` is initialised with the persisted message history.
- New state: `currentConversationId: string | null`. Updated from the server's `data-conversationId` UI-stream chunk after each turn.
- Pass `currentConversationId` in the per-call body.
- Two new icon buttons at the right of the form's header (passed via render prop or wired conditionally on `submissionId` presence): history clock and `+`.
- New components: `TalkHistoryPopover`, `TalkHistoryRow`. Source the list via `listConversations`; the popover is mounted into the same `TooltipProvider` we already have.
- `+` handler: clear `useChat` state (`setMessages([])`), clear chip, set `currentConversationId = null`. Don't touch the DB.

### 5. Surface integration

- **Editor `ChatPanel`**: on mount, call `getRecentConversationForSubmission({ submissionId })`. If a result lands within 24h, pre-seed `TalkToDeepMarkChat`'s `conversationId` + initial messages. Otherwise start fresh.
- **Dashboard `TalkToDeepMarkDialog`** and **`/teacher/talk` page**: on mount, call `getRecentConversationGlobal()`. Same pre-seed behaviour, no freshness cap.
- All three surfaces pass `submissionId` (or undefined) for editor-vs-global mode detection, same as today.

### 6. History popover

`apps/web/src/components/talk/talk-history-popover.tsx` — uses `Popover` primitive (already in `components/ui/`). Wired to `listConversations` via React Query.

### 7. Unit tests

- `apps/web/src/lib/talk/conversations/__tests__/`:
  - Title derivation pure function (trim, collapse, truncate at 60).
  - Idempotent join-row upsert behaviour (calling `appendConversationTurn` with the same `submissionRefs` twice doesn't create duplicate rows).
  - Lazy-create behaviour (passing `conversationId = null` creates a new row; passing an existing id appends to it).
- Authz integration test: a teacher loading another teacher's conversation by id gets a 403/empty.

## Order of operations

| Step | Risk | Effort |
|---|---|---|
| 1. Add Prisma models + `bun db:push` | Low | 5 min |
| 2. Pure helpers: title derivation, message-merge | Low | 30 min |
| 3. Server actions (queries + mutations) with unit tests | Medium | 60 min |
| 4. Route handler — load + append + emit `conversationId` UI chunk | Medium | 60 min |
| 5. `TalkToDeepMarkChat`: accept `conversationId`, listen for the data chunk, update local state | Medium | 60 min |
| 6. History popover + `+` button UI | Medium | 90 min |
| 7. Surface auto-resume wiring (editor, dashboard, /teacher/talk) | Low | 30 min |
| 8. End-to-end sanity: refresh resumes; switch tabs resumes; new conversation creates; history shows it; @-cross-reference doesn't dup join | Medium | 60 min |

**Total estimate: 6-8 hours focused work, no LLM cost beyond the chat itself.**

## Acceptance criteria

1. **Refresh resumes.** Open editor's chat panel, send a turn, hard-refresh the browser. Re-opening the same submission's editor shows the same conversation pre-populated.
2. **Cross-surface continuity.** Send a turn from the dashboard "Ask anything" pill; the same conversation appears as "most recent" on `/teacher/talk` and stays attachable from the history popover in the editor (if it referenced a submission).
3. **Per-submission auto-resume in editor.** Submission A has a recent conversation (<24h). Open submission A's editor → that conversation auto-loads. Open submission B's editor (which has no conversation yet) → blank state.
4. **24h freshness cap.** Submission A's last conversation is 26h old. Open editor → blank, NOT the old conversation. The old conversation is reachable from the history popover.
5. **`+` lazy-creates.** Click `+` from a populated chat → empty state. No DB row written. Send a message → exactly one new row appears in `talk_conversations`.
6. **Multi-submission join.** Mid-conversation, @-mention a second submission. Verify exactly one row added to `talk_conversation_submissions` (not two for the same pair if @-mention is sent twice). Both submissions' preambles ship on subsequent turns.
7. **Inaccessible submission gracefully degrades.** Revoke a teacher's access to a submission referenced in their conversation. Reopen — chip greys out; clicking "Resume" still works; the next turn's preamble silently drops the inaccessible submission and the LLM gets a `[Notice: submission "…" is no longer accessible — context excluded.]` system message inline.
8. **No regression** in `web:unit`, the existing preamble tests, or the in-memory chat flow when this lands.

## Files to touch

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | Add `TalkConversation` + `TalkConversationSubmission` models + inverse relations on `User` and `StudentSubmission` |
| `apps/web/src/lib/talk/conversations/queries.ts` (new) | `getRecentConversationForSubmission`, `getRecentConversationGlobal`, `listConversations` |
| `apps/web/src/lib/talk/conversations/mutations.ts` (new) | `appendConversationTurn`, `deleteConversation` |
| `apps/web/src/lib/talk/conversations/title.ts` (new) | Pure title-derivation helper |
| `apps/web/src/lib/talk/conversations/__tests__/` (new) | Title derivation, mutation idempotency, authz |
| `apps/web/src/app/api/talk/route.ts` | Accept `conversationId` + `mentionedSubmissionIds`; persist on `onFinish`; emit `data-conversationId` UI chunk |
| `apps/web/src/components/talk/talk-to-deepmark-chat.tsx` | Accept `conversationId`, pre-seed messages, listen for the data chunk |
| `apps/web/src/components/talk/talk-history-popover.tsx` (new) | History popover + rows |
| `apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/chat-panel.tsx` | Header gains `+` and history-clock icon buttons; on mount, call `getRecentConversationForSubmission` |
| `apps/web/src/app/teacher/talk-to-deepmark-dialog.tsx` | Same two icons in dialog header; pre-seed via `getRecentConversationGlobal` |
| `apps/web/src/app/teacher/talk/page.tsx` | Same |

**Files explicitly NOT touched:**
- `apps/web/src/lib/talk/build-submission-preamble.ts` — preamble is per-turn, stateless; persistence sits one layer up.
- `apps/web/src/lib/talk/system-prompt.ts` — no prompt changes needed for persistence itself.

## Risks and watch-outs

- **JSONB write contention.** Two tabs of the same conversation will race the `messages` write. Mitigation in `appendConversationTurn`: read current `messages.length`, fail with 409 if the client's expected length doesn't match. Client retries by refetching. Acceptable for v1; revisit if real teacher behaviour shows this happens often.
- **Persisted-shape lock-in.** Once we persist `UIMessage[]` with tool-call parts (after Phase 3+4), changing the shape requires migration code. Pre-launch we don't care — but worth knowing that the AI-SDK version bump that changes `UIMessage` is now load-bearing.
- **Lazy-create + `+`-click UX.** If a teacher clicks `+`, types in the textarea, then closes the panel WITHOUT sending — the typed text is lost. Acceptable (matches every chat app's behaviour) but worth a one-line note in the panel header empty state ("Start typing — your draft is local until you send").
- **Authz-at-read latency.** Per-turn re-checking each referenced submission's access adds N queries per turn (N ≈ 1–3 typically). Cheap; not worth pre-optimising.
- **History popover stale list.** `listConversations` is server-state — TanStack Query with normal stale-time (30s) is fine. After `+` → send, invalidate the conversations list so the new one appears immediately in the popover.
- **Deleted submission, conversation remains.** Cascade delete removes the join row; the messages JSONB might still reference the submission by id in its turns. Acceptable — the LLM history is a record of what was discussed, not a guarantee of current state. Preamble loader handles the missing row by treating it as "inaccessible".

## Open questions (defer to implementation time)

1. **Stream the `conversationId` back to the client via `streamData` UI chunk, or via response headers?** Recommend: UI chunk; aligns with how the AI SDK already pipes UI state.
2. **Should the history popover live inside `TalkToDeepMarkChat` or be wired by each surface?** Recommend: inside, so the editor / dashboard / standalone page all get it for free.
3. **`+` keyboard shortcut?** ⌘N is the natural choice but conflicts with browser "new window". Defer until a power user asks.
4. **Conversation export (download as markdown)?** Out of scope, but trivial follow-up once persistence lands.
5. **Multi-submission @-mention UI.** Server-side multi-submission preamble loading IS in scope (`mentionedSubmissionIds` accepted). Client-side `@`-autocomplete in the textarea is the polish that lets teachers actually use it. Recommend: ship server side now, add client UI in a follow-up.

## Why after tool calls (Phase 3+4), not before

Tool calls land first because:
1. They're the higher-value feature — DeepMark editing the script vs DeepMark remembering yesterday's chat.
2. Persistence forces a decision on how to serialise tool-call state (the AI-SDK's tool-call message parts). Doing persistence after tool calls means we serialise the real shape, not a placeholder.
3. Persistence is shippable in isolation later without re-touching tool-call code.

## Out of scope

- Conversation sharing between users.
- Folder / tag organisation of conversations.
- Full-text search.
- LLM-generated titles.
- @-mention textarea autocomplete (server-side multi-submission preamble IS in scope; the UI affordance is not).
- Multi-revision / branched conversations (only linear append).
- Real-time multi-tab sync of in-flight messages (the 409-and-retry pattern is the v1 contention model).
