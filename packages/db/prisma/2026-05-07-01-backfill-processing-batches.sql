-- Phase B of the ProcessingBatch refactor (see PROCESSING-BATCH-REFACTOR.md).
--
-- Creates one ProcessingBatch per existing BatchIngestJob that has at least
-- one StudentSubmission, then sets `processing_batch_id` on every submission.
--
-- - kind: every backfilled row is `initial` (the new model only distinguishes
--   re_grade / re_extract for batches created by the new code paths).
-- - status: derived from BatchIngestJob.status — `complete`/`failed` map
--   straight through; everything else (uploading / classifying / staging /
--   marking) maps to `pending`.
-- - total_jobs: actual COUNT of child submissions, not the historical
--   `total_student_jobs` counter, which on dev is wildly incorrect for
--   batches that committed in chunks (one row shows 1 with 47 submissions).
--   The new completion check uses total_jobs as truth, so seeding it from
--   the wrong source would jam every backfilled batch's notification.
-- - notification_sent_at: copied verbatim — preserves "email already fired"
--   so we don't double-send anything when the new check runs.
-- - id: deterministic `pb_<batch_id>` prefix so every backfilled row is
--   trivially identifiable and removable if the migration needs to be
--   rerun. Prisma's `@default(cuid())` only kicks in when the id is
--   unspecified at insert time, so this string id is allowed.
-- - empty BatchIngestJobs (no committed submissions) intentionally do NOT
--   get a ProcessingBatch — those are pre-commit ingest-only rows that
--   never produced any work.

BEGIN;

WITH inserted_batches AS (
  INSERT INTO processing_batches (
    id,
    exam_paper_id,
    triggered_by,
    kind,
    status,
    total_jobs,
    notification_sent_at,
    ingest_batch_id,
    created_at,
    completed_at
  )
  SELECT
    'pb_' || b.id,
    b.exam_paper_id,
    b.uploaded_by,
    'initial'::"ProcessingBatchKind",
    CASE
      WHEN b.status = 'complete' THEN 'complete'::"ProcessingBatchStatus"
      WHEN b.status = 'failed'   THEN 'failed'::"ProcessingBatchStatus"
      ELSE 'pending'::"ProcessingBatchStatus"
    END,
    (SELECT COUNT(*)::int FROM student_submissions s WHERE s.batch_job_id = b.id),
    b.notification_sent_at,
    b.id,
    b.created_at,
    b.notification_sent_at
  FROM batch_ingest_jobs b
  WHERE EXISTS (SELECT 1 FROM student_submissions s WHERE s.batch_job_id = b.id)
  RETURNING id, ingest_batch_id
)
UPDATE student_submissions s
SET processing_batch_id = pb.id
FROM inserted_batches pb
WHERE s.batch_job_id = pb.ingest_batch_id;

COMMIT;
