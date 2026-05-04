-- Optional: index on questions.embedding for similarity search.
-- Run after `prisma db push` so the questions table and embedding column exist.
CREATE INDEX IF NOT EXISTS "questions_embedding_idx"
    ON "questions"
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Partial unique index: at most one `trial_grant` ledger row per user.
-- Closes the race where two parallel logins both pass the auth.ts findFirst
-- pre-check and both insert (would otherwise grant 40 trial papers instead of
-- 20). Prisma's schema-level @@unique can't model "WHERE kind = '...'", so
-- this is raw SQL — same precedent as the embedding index above.
-- Idempotent: IF NOT EXISTS guards re-runs of setup-vectors.sql.
CREATE UNIQUE INDEX IF NOT EXISTS "paper_ledger_trial_grant_per_user_idx"
    ON "paper_ledger" ("user_id")
    WHERE kind = 'trial_grant';
