
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
async function create_user_db() {
  // create/drop DB using a standalone connection
  const adminConn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  await adminConn.query(`DROP DATABASE IF EXISTS \`${process.env.DB_DATABASE}\``);
  await adminConn.query(`CREATE DATABASE \`${process.env.DB_DATABASE}\``);
  await adminConn.end();

  // now use the pool, which is configured with DB_DATABASE
  const conn = await pool.getConnection();
  try {
    // ensure we are using the right DB
    await conn.query(`USE \`${process.env.DB_DATABASE}\``);

    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS tbl_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uid VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        role_id INT,
        encrypted_key VARCHAR(3072),
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await conn.query(createUsersTable);

    const createRolesTable = `
      CREATE TABLE IF NOT EXISTS tbl_role (
        role_id INT PRIMARY KEY,
        role_name VARCHAR(255),
        role_desc VARCHAR(255)
      )
    `;
    await conn.query(createRolesTable);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        major VARCHAR(100),
        gpa DECIMAL(3,2),
        classes TEXT,
        extra_info TEXT,
        advisor_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES tbl_users(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS advisors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        department VARCHAR(100),
        office_hours VARCHAR(255),
        contact_email VARCHAR(255),
        max_students INT DEFAULT 30,
        current_load INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES tbl_users(id) ON DELETE CASCADE
      )
    `);
  } finally {
    conn.release();
  }
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
  const [result] = await connection.query(query, [uid, email, role_id, encrypted_key]);
  return { id: result.insertId, uid, email, role_id, encrypted_key };
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

// createStudentProfile.js
async function createStudentProfile({ user_id, major, gpa, classes, extra_info }) {
  const [result] = await pool.query(
    `INSERT INTO students (user_id, major, gpa, classes, extra_info)
     VALUES (?, ?, ?, ?, ?)`,
    [user_id, major, gpa, classes, extra_info]
  );
  return { id: result.insertId, user_id, major, gpa, classes, extra_info };
}

// assignAdvisorForStudent.js
async function assignAdvisorForStudent(studentUserId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT user_id, current_load, max_students
       FROM advisors
       ORDER BY current_load ASC
       LIMIT 1`
    );

    if (!rows.length) {
      throw new Error('No advisors configured');
    }

    const adv = rows[0];
    if (adv.current_load >= adv.max_students) {
      throw new Error('All advisors are at max capacity');
    }

    await conn.query(
      'UPDATE students SET advisor_id = ? WHERE user_id = ?',
      [adv.user_id, studentUserId]
    );
    await conn.query(
      'UPDATE advisors SET current_load = current_load + 1 WHERE user_id = ?',
      [adv.user_id]
    );

    await conn.commit();
    return adv.user_id;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// getUserWithAdvisorInfo.js
async function getUserWithAdvisorInfo(userId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.email, a.department, a.office_hours, a.contact_email
     FROM tbl_users u
     JOIN advisors a ON a.user_id = u.id
     WHERE u.id = ?`,
    [userId]
  );
  return rows[0] || null;
}

async function getStudentProfileByUserId(userId) {
  const [rows] = await pool.query(
    `SELECT major, gpa, classes, extra_info, advisor_id FROM students WHERE user_id = ?`,
    [userId]
  );
  return rows[0] || null;
}

async function updateStudentProfile(userId, { major, gpa, classes, extra_info }) {
  const [result] = await pool.query(
    `UPDATE students
     SET major = ?, gpa = ?, classes = ?, extra_info = ?
     WHERE user_id = ?`,
    [major, gpa, classes, extra_info, userId]
  );
  return result;
}


 async function insert_advisor(connection, {
  user_id,
  department,
  office_hours,
  contact_email,
  max_students,
  current_load
}) {
  const [result] = await connection.query(
    `INSERT INTO advisors (user_id, department, office_hours, contact_email, max_students, current_load)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user_id, department, office_hours, contact_email, max_students, current_load]
  );
  return { id: result.insertId, user_id };
}



export {
  pool,
  create_user_db,
  insert_role,
  insert_user,
  get_user,
  update_user,
  delete_user,
  test_db,
  createStudentProfile,
  assignAdvisorForStudent,
  getUserWithAdvisorInfo,
  getStudentProfileByUserId,
  updateStudentProfile,
  insert_advisor
};
