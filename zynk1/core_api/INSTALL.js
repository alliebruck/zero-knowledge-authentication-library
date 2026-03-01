
import { pool, create_user_db, insert_role, insert_user, insert_advisor } from './db_ops.js';
import 'dotenv/config';

async function install() {
  let connection;
  try {
    console.log('Starting database installation...');

    await create_user_db();
    console.log('Database and tables created/recreated successfully.');

    connection = await pool.getConnection();

    // 1. Insert roles
    console.log('Inserting default roles...');
    await insert_role(connection, 1, 'admin', 'Administrator with full privileges');
    await insert_role(connection, 2, 'advisor', 'Faculty advisor');
    await insert_role(connection, 3, 'student', 'Student user');
    console.log('Default roles inserted.');

    // 2. Insert pre-created advisor shell accounts (no pub_key yet)
    console.log('Inserting advisors...');
    const prof1 = await insert_user(
      connection,
      null,                    // pub_key / uid initially null
      'prof1@example.edu',     // email
      2,                       // role_id = advisor
      null                     // encrypted_key / pub_key placeholder
    );
    const prof2 = await insert_user(
      connection,
      null,
      'prof2@example.edu',
      2,
      null
    );

    await insert_advisor(connection, {
      user_id: prof1.id,
      department: 'Computer Science',
      office_hours: 'MW 2–4pm',
      contact_email: 'prof1@example.edu',
      max_students: 30,
      current_load: 0
    });

    await insert_advisor(connection, {
      user_id: prof2.id,
      department: 'Mathematics',
      office_hours: 'TR 1–3pm',
      contact_email: 'prof2@example.edu',
      max_students: 25,
      current_load: 0
    });

    console.log('Advisors inserted.');

    // 3. Optionally insert a demo admin user
    console.log('Inserting admin user...');
    await insert_user(
      connection,
      'admin1_pubkey',
      'admin1@example.com',
      1,                        // admin
      'admin1_pubkey'
    );
    console.log('Admin inserted.');

    console.log('Database installation complete!');
  } catch (err) {
    console.error('Database installation failed:', err);
    process.exit(1);
  } finally {
    if (connection) connection.release();
    if (pool) await pool.end();
  }
}

install();
