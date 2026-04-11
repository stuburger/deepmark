import { neonConfig } from "@neondatabase/serverless"
import { PrismaNeon } from "@prisma/adapter-neon"
import ws from "ws"
import { PrismaClient } from "./generated/prisma/client"

neonConfig.webSocketConstructor = ws

export const createPrismaClient = (dbUrl: string): PrismaClient => {
	if (!dbUrl) {
		throw new Error("DATABASE_URL is not set")
	}

	const adapter = new PrismaNeon({ connectionString: dbUrl })
	return new PrismaClient({ adapter })
}
