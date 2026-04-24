# Collab Verification Checklist

> Post-K-9 manual smoke test. Run before shipping a demo, or after any
> change to `useYDoc`, the collab-server package, the projection Lambda, or
> the grading Lambda's Y.Doc write path.

## Setup

- Deploy target stage (e.g. `production`) with the full collab stack.
- Ensure `sst secret set CollabServiceSecret "..."` has been run at least
  once for the stage.
- Have at least one submission with completed OCR and grading available.

## The checklist

### 1. Multi-tab, same browser (BroadcastChannel + IndexedDB)

- Open submission X in tab A. Add a `tick` mark over some answer text.
- Open the same submission in tab B (same browser).
- Expected: tab B shows the tick within ~200ms.
- Expected: both tabs show the same annotation set.

### 2. Multi-device (Hocuspocus WebSocket)

- Open submission X on your laptop (device 1).
- Open the same submission on your phone / another browser (device 2).
- Add a `cross` mark on device 1.
- Expected: device 2 shows the cross within ~500ms.
- Remove the mark on device 2. Device 1 should reflect the removal.

### 3. Teacher override of an AI annotation

- Open submission X — confirm at least one AI annotation is visible.
- Delete the AI annotation (select, `Clear` in bubble menu).
- Refresh the page.
- Expected: annotation stays deleted.
- ⚠️ **Known limitation:** if the grading pipeline is re-run, the deleted AI
  annotation will **come back**. We don't maintain a tombstone registry yet
  (deferred from K-4 when we moved AI ingestion server-side). Fix would be
  a sidecar `tombstones` Y.Map or a `deleted_at` marker on the ai-annotations
  Y.Map entry itself.

### 4. Persistence across full browser close

- Open submission X, add a teacher mark.
- Close every tab and the browser window.
- Reopen the browser, navigate back to submission X.
- Expected: teacher mark is still there.
- This verifies IndexedDB persistence AND Hocuspocus + S3 round-trip.

### 5. Cross-stage isolation

- Open submission X under your `production` stage.
- Open the same submission ID under a non-prod stage (e.g. `stuartbourhill`).
- Note: both stages' Y.Docs are physically stored in production's S3 bucket
  (because only production runs Hocuspocus), but document names are
  prefixed by stage.
- Expected: edits in the production tab do NOT appear in the non-prod tab
  and vice versa.
- Expected: `SELECT count(*) FROM student_paper_annotations WHERE submission_id = '<id>'`
  against the production Neon branch returns rows; against the non-prod
  branch, returns only what was written via the non-prod grading Lambda.

### 6. Hocuspocus task crash / restart

- Start editing a submission.
- In AWS ECS Console, stop the Hocuspocus task manually (or redeploy).
- Expected: active clients show a brief "reconnecting" state, then resume.
- Expected: IndexedDB preserves all local edits; no data loss.
- Expected: ECS auto-restarts the task within ~30s (target group health check).

### 7. Projection → Neon

- Add or remove an AI annotation via the grading Lambda (trigger a grading run).
- Wait ~5s for the Hocuspocus debounce + S3 event + projection Lambda.
- Run against the stage's Neon branch:
  ```sql
  SELECT count(*) FROM student_paper_annotations
  WHERE submission_id = '<id>' AND source = 'ai' AND deleted_at IS NULL;
  ```
- Expected: count matches the number of AI annotations shown in the UI.
- ⚠️ **Known limitation:** teacher edits are NOT projected to DB yet. The
  projection Lambda only reads the `ai-annotations` Y.Map, not the doc
  XmlFragment. Analytics that count teacher overrides will miss them.

### 8. Enrichment re-run

- Note the current AI annotation count for submission X.
- Delete one AI annotation as a teacher.
- Trigger a grading re-run (requeue the submission).
- Expected: new AI annotations appear (possibly the same ones — see #3).
- Expected: **teacher edits** (including the deletion) are preserved — CRDT
  merge behavior.
- ⚠️ See #3: the deleted AI annotation may come back after the re-run.

## Rollback kill switch

`NEXT_PUBLIC_DEEPMARK_COLLAB_MODE` controls client behavior at build time:

| Value | Behavior |
|---|---|
| `collab` (default) | IndexedDB + HocuspocusProvider. Full collab stack. |
| `indexeddb-only` | IndexedDB only. No WebSocket. Edits persist locally only — no cross-tab, no cross-device. |

To flip:
```bash
# In whatever env the Next.js build runs (SST env in infra/web.ts or
# apps/web/.env.local for local dev):
NEXT_PUBLIC_DEEPMARK_COLLAB_MODE=indexeddb-only
```
Then redeploy.

Teacher edits made while in `indexeddb-only` mode stay on the device they
were made on. Flipping back to `collab` later will try to sync those edits
up to Hocuspocus — they'll merge cleanly if the Y.Doc in Hocuspocus hasn't
drifted, or they'll show up as additional CRDT ops on top if it has.

A true legacy rollback (pre-Yjs, server-side diff persistence) would require
reverting the K-8 commit. Prefer the flag path.

## Deeper rollback paths

If something catastrophic happens to a submission's Y.Doc:

1. **Single submission corruption:**
   Delete the snapshot from S3 (`aws s3 rm s3://<scansBucket>/yjs/<stage>:submission:<id>.bin`).
   Next time a client opens the submission, Hocuspocus sees no snapshot,
   client seeds from `buildAnnotatedDoc()` (DB state at that moment).
   Teacher-only edits that weren't in DB are lost — accept the loss, or
   recover via IndexedDB if any client still has them cached.

2. **All Y.Docs for a stage corrupted:**
   Delete `s3://<scansBucket>/yjs/<stage>:*`. Every submission re-seeds on
   next open. Pre-corruption teacher edits unrecoverable unless cached in
   IndexedDB on some device.

3. **Neon projection rows drifted from Y.Doc:**
   Trigger any Y.Doc write on the submission (e.g. open it and dispatch an
   empty transaction). Hocuspocus will debounce-save, S3 event fires,
   projection Lambda rebuilds the AI annotation rows.
