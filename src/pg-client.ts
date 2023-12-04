import * as schema from './schemas';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import 'dotenv/config';

const PG_URI = process.env.PG_URI || 'postgres://localhost:5432';

export class PgClient {
  static instance: PgClient;

  private db: ReturnType<typeof drizzle>;
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: PG_URI,
    });

    this.db = drizzle(this.pool, { schema });
  }

  static getInstance(): ReturnType<typeof drizzle> {
    if (!PgClient.instance) PgClient.instance = new PgClient();
    return PgClient.instance.db;
  }
}
