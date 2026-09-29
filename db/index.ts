import { drizzle } from "drizzle-orm/node-postgres";
import { database } from "../lib/server-data";
import * as schema from "./schema";

export function getDb() {
  return drizzle(database(), { schema });
}
