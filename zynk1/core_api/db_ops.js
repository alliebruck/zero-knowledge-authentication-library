
import mysql from 'mysql2/promise';
import assert from 'assert';
import 'dotenv/config';

// Create a connection pool
let pool;
try {
    pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log("Database pool created successfully.");
} catch (error) {
    console.error("Failed to create database pool:", error);
    process.exit(1);
}


//task 2. write a function named create_user_db() given a database connection
//It creates two tables: tbl_users which has the following columns:
//  (uid, uname, role_id, encrypted_key).
//  uid is the primary key, and integer type, role_id is also integer
//  uname is string type.
//  encrypted_key is a var_char type which allows at least 3072 chars
//  the second table is tbl_role, which has the folowing columns:
//  (role_id, role_name, role_desc)
//  where role_id is the primary key, and role_desc and role_name are string type.
//  If the database already exists, REMOVE everything.
//  Create the database as an empty database.
async function create_user_db(connection) {
    // Note: Dropping and creating databases is not typically done by the application itself.
    // This is kept for consistency with the original file's 'test_db' function.
    // In a real app, the DB should be provisioned separately.
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });
    await conn.query(`DROP DATABASE IF EXISTS ${process.env.DB_DATABASE}`);
    await conn.query(`CREATE DATABASE ${process.env.DB_DATABASE}`);
    await conn.end();

    const poolConnection = await pool.getConnection();
    const createUsersTable = `
        CREATE TABLE tbl_users (
            uid VARCHAR(255) PRIMARY KEY,
            email VARCHAR(255) UNIQUE,
            role_id INT,
            encrypted_key VARCHAR(3072)
        )
    `;
    await poolConnection.query(createUsersTable);
    const createRolesTable = `
        CREATE TABLE tbl_role (
            role_id INT PRIMARY KEY,
            role_name VARCHAR(255),
            role_desc VARCHAR(255)
        )
    `;
    await poolConnection.query(createRolesTable);
    poolConnection.release();
}


//task 3. write a function insert_role(), which given a database connection,
// and role_id, role_name, role_descriptoin, insert a row into the table tbl_role
async function insert_role(connection, role_id, role_name, role_desc) {
    const query = 'INSERT INTO tbl_role (role_id, role_name, role_desc) VALUES (?, ?, ?)';
    await connection.query(query, [role_id, role_name, role_desc]);
}


//task 4. write a function insert_user, which given a database connection,
// and the information of uid, email, role_id, encrypted_key, insert a row into tbl_user
async function insert_user(connection, uid, email, role_id, encrypted_key) {
    const query = 'INSERT INTO tbl_users (uid, email, role_id, encrypted_key) VALUES (?, ?, ?, ?)';
    await connection.query(query, [uid, email, role_id, encrypted_key]);
}


//task 5. write a function get_user(CONN, user_id), and retrieve the information
//from tbl_user as a JSON array
async function get_user(connection, user_id) {
    const query = 'SELECT * FROM tbl_users WHERE uid = ?';
    const [rows] = await connection.query(query, [user_id]);
    return rows;
}

async function update_user(connection, userId, updates) {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const query = `UPDATE tbl_users SET ${setClause} WHERE uid = ?`;
    await connection.query(query, [...values, userId]);
}

async function delete_user(connection, userId) {
    const query = 'DELETE FROM tbl_users WHERE uid = ?';
    await connection.query(query, [userId]);
}


//task 6. write a function test_db(), which first carestse user database, inserts
// two roles: teacher and student, and then insert two student accounts, and then call 
// get_user() to retrieve the information of student 1 and verify if the info is correct.
async function test_db() {
    let connection;
    try {
        await create_user_db();
        connection = await pool.getConnection();
        await insert_role(connection, 1, 'teacher', 'Instructor');
        await insert_role(connection, 2, 'student', 'Learner');
        await insert_user(connection, 1, 'student1', 2, 'key1');
        await insert_user(connection, 2, 'student2', 2, 'key2');
        const user1 = await get_user(connection, 1);
        console.log(user1);
        assert.deepStrictEqual(user1, [{ uid: 1, uname: 'student1', role_id: 2, encrypted_key: 'key1' }]);
        console.log('Test passed!');
    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        if (connection) connection.release();
    }
}

export {
    pool,
    create_user_db,
    insert_role,
    insert_user,
    get_user,
    update_user,
    delete_user,
    test_db
};
