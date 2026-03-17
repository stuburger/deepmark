-- Enable pgvector so the "vector" type exists before Prisma creates tables that use it.
-- Must be run before `prisma db push` or any migration that creates the questions table.
CREATE EXTENSION IF NOT EXISTS vector;
