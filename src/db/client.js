import pg from "pg";
import { config } from "../app/config.js";

export function create_pool(connection_string = config.database_url) {
  return new pg.Pool({ connectionString: connection_string });
}

export const pool = create_pool();
