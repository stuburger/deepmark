import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"

export const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)
