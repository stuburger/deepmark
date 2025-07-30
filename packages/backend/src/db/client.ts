import { PrismaClient } from "@/generated/prisma";
import { Resource } from "sst";

export const db = new PrismaClient();
