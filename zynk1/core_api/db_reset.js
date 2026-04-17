// core_api/db_reset.js
import { create_user_db, insert_role, pool } from './db_ops.js';

async function run() {
    console.log("Resetting database...");
    try {
        await create_user_db();
        const connection = await pool.getConnection();
        try {
            await insert_role(connection, 1, 'admin', 'Administrator');
            await insert_role(connection, 2, 'advisor', 'Faculty Advisor');
            await insert_role(connection, 3, 'student', 'Student');
            console.log("Database reset and roles inserted successfully.");
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Error resetting database:", error);
    } finally {
        pool.end();
    }
}

run();
