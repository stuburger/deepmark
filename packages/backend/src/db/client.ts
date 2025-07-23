import { MongoClient } from "mongodb";
import { Resource } from "sst";

const MONGODB_URI = Resource.MongoDbUri.value || "mongodb://localhost:27017";
const DATABASE_NAME = process.env.MONGODB_DATABASE || "gcse_exam_tool";

export const client = await MongoClient.connect(MONGODB_URI);
export const db = client.db(DATABASE_NAME);
