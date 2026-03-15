import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaClient } from "./generated/prisma/client";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

export const createPrismaClient = (dbUrl: string): PrismaClient => {
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaNeon({ connectionString: dbUrl });
  return new PrismaClient({ adapter });
};
