-- Optional: index on questions.embedding for similarity search.
-- Run after `prisma db push` so the questions table and embedding column exist.
CREATE INDEX IF NOT EXISTS "questions_embedding_idx"
    ON "questions"
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
