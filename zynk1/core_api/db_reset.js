// core_api/db_reset.js
import { test_db, pool } from './db_ops.js';

async function run() {
    await test_db();
    pool.end();
}

run();
