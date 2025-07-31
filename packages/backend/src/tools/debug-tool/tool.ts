import { DebugToolSchema } from "./schema";
import { db } from "../../db/client";
import { tool, text } from "../tool-utils";
import { ObjectId } from "mongodb";

export const handler = tool(DebugToolSchema, async (args, extra) => {
  console.log(extra);
  return text(JSON.stringify(extra));
});
