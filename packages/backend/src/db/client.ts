import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DATABASE_NAME = process.env.MONGODB_DATABASE || "gcse_exam_tool";

export const client = await MongoClient.connect(MONGODB_URI);
export const db = client.db(DATABASE_NAME);
