import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { DATABASE_URL, PGHOST, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
if (!DATABASE_URL && !(PGHOST && PGUSER && PGPASSWORD)) {
  throw new Error("Set DATABASE_URL or PGHOST, PGUSER, and PGPASSWORD before running migrations.");
}

const pool = new pg.Pool(DATABASE_URL
  ? { connectionString: DATABASE_URL }
  : {
      host: PGHOST,
      user: PGUSER,
      password: PGPASSWORD,
      database: PGDATABASE || "postgres",
      port: 5432,
      ssl: { rejectUnauthorized: true },
    });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./migrations" });
  process.stdout.write("Database migrations complete.\n");
} finally {
  await pool.end();
}
