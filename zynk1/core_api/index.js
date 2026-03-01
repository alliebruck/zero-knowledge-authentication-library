
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import * as snarkjs from 'snarkjs';
import fs from 'fs';
const app = express();
const port = 3000;
import session from 'express-session';
import { pool, get_user, insert_user, update_user, delete_user, createStudentProfile, insert_advisor, getUserWithAdvisorInfo, assignAdvisorForStudent  } from './db_ops.js';
import { verify_proof } from './zk.js';
import { register_user, find_user_by_pub_key, find_user_by_email } from './user.js';
import crypto from 'crypto';
import { hexToBytes, bytesToHex } from '@noble/curves/utils.js';

app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'a-very-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

const allowedOrigins = [
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://172.20.200.167:8000',
  'http://0.0.0.0:8000', // Python's http.server default binding
  null, // For file:// origins
  'chrome-extension://ifgchahfkbhmpaicigloblelmffgojeg' // Chrome extension origin
  // add more as needed, e.g. 'http://localhost:5173'
];



app.use(cors({
  origin: (origin, callback) => {
    // allow non-browser / same-origin requests with no Origin header
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Changed to console.error for better visibility of blocked origins
    console.error(`CORS: Origin ${origin} not allowed`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // allow cookies/sessions
}));



app.post('/login_challenge', async (req, res) => {
  console.log("HIT /login_challenge", req.body);
  console.log("Session before /login_challenge:", req.session);
  const { email } = req.body;
  if (!email) return res.status(400).send({ message: 'Email is required' });

  // generate random 32-byte nonce
  const nonce = crypto.randomBytes(32).toString('hex'); // 64-char hex [web:555][web:558]

  // store it server-side, tied to email and expiry
  req.session.loginChallenge = {
    email,
    nonce,
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
  };
  req.session.save();

  res.status(200).send({ nonce });
});


app.post('/login_zk', async (req, res) => {
  console.log("HIT /login_zk", req.body);
  console.log("Session before /login_zk:", req.session);
  const { email, pub_key, proof, nonce } = req.body; // <--- Get nonce from body
  if (!email || !pub_key || !proof || !nonce) { // <--- nonce is now required
    return res.status(400).send({ message: 'Email, public key, proof, and nonce are required' });
  }

  try {
    const challenge_bytes = hexToBytes(nonce); // <--- Use nonce directly

    console.log("Calling verify_proof with:", { pub_key, proof, challenge_bytes: bytesToHex(challenge_bytes) });
    const is_valid = verify_proof(pub_key, proof, challenge_bytes);
    if (!is_valid) {
      return res.status(401).send({ message: 'Invalid proof. Login failed.' });
    }

    // Existing DB lookup
    const [rows] = await pool.query(
      'SELECT id, email, uid AS pub_key, role_id FROM tbl_users WHERE email = ? LIMIT 1',
      [email]
    );
    const user = rows[0];
    if (!user) {
      return res.status(404).send({ message: 'User not found. Please register.' });
    }

    if (user.pub_key !== pub_key) {
      return res.status(401).send({ message: 'Public key mismatch. Login failed.' });
    }

    req.session.userId = user.id;

    return res.status(200).send({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role_id === 2 ? 'advisor' : 'student'
      }
    });
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).send({ message: 'Internal Server Error' });
  }
});


// optional: make sure Vary: Origin is sent correctly
app.use((req, res, next) => {
  res.header('Vary', 'Origin');
  next();
});

// index.js

app.post('/register_zk', async (req, res) => {
  const {
    pub_key,
    proof,
    email,
    name,
    role  // we will ignore/force student for now
  } = req.body;

  if (!pub_key || !proof || !email || !name) {
    return res.status(400).send({
      message: 'Name, email, public key, and proof are required'
    });
  }

  try {
    const static_challenge_bytes = new Uint8Array(32).fill(0x01);
    const is_valid = verify_proof(pub_key, proof, static_challenge_bytes);
    if (!is_valid) {
      return res.status(401).send({ message: 'Invalid proof. Registration failed.' });
    }

    const finalRoleId = 3; // assume 3 = student in tbl_role

    // Check if user already exists by email
    const [existing] = await pool.query(
      'SELECT id FROM tbl_users WHERE email = ? LIMIT 1',
      [email]
    );
    if (existing.length) {
      return res.status(409).send({ message: 'User already exists' });
    }

    // Insert into tbl_users (DB-backed, not user.js)
    const connection = await pool.getConnection();
    try {
      const userRow = await insert_user(connection, pub_key, email, finalRoleId, pub_key);
      const userId = userRow.id;

      console.log('REGISTER_ZK inserted DB user:', userRow);

      return res.status(201).send({
        message: 'User registered successfully',
        user: {
          id: userId,
          email,
          role: 'student'
        }
      });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('Error during registration:', err);
    return res.status(500).send({ message: 'Internal Server Error' });
  }
});



app.post('/claim_advisor', async (req, res) => {
  const { email, pub_key, proof } = req.body;

  if (!email || !pub_key || !proof) {
    return res.status(400).send({ message: 'Email, pub_key, and proof are required' });
  }

  if (!verify_proof(pub_key, proof)) {
    return res.status(401).send({ message: 'Invalid proof' });
  }

  try {
    const advisorUser = await findUserByEmailAndRole(email, 'advisor');
    if (!advisorUser) {
      return res.status(404).send({
        message: 'No pre-created advisor account found for this email'
      });
    }

    if (advisorUser.pub_key && advisorUser.pub_key !== pub_key) {
      return res.status(409).send({
        message: 'This advisor account has already been claimed with a different key'
      });
    }

    const updated = await setUserPubKey(advisorUser.id, pub_key);

    return res.status(200).send({
      message: 'Advisor account claimed successfully',
      user: updated
    });
  } catch (err) {
    console.error('Error in /claim_advisor:', err);
    return res.status(500).send({ message: 'Internal Server Error' });
  }
});

app.get('/me', async (req, res) => {
  try {
    const currentUserId = req.session.userId; // or from your auth
    if (!currentUserId) {
      return res.status(401).send({ message: 'Not logged in' });
    }

    // base user
    const [users] = await pool.query(
      'SELECT id, email, role_id, uid AS pub_key, name FROM tbl_users WHERE id = ?',
      [currentUserId]
    );
    const user = users[0];
    if (!user) return res.status(404).send({ message: 'User not found' });

    if (user.role_id === 3) {
      // student
      const [stuRows] = await pool.query(
        'SELECT major, gpa, classes, extra_info, advisor_id FROM students WHERE user_id = ?',
        [user.id]
      );
      const student_profile = stuRows[0] || null;

      let advisor = null;
      if (student_profile?.advisor_id) {
        const [advRows] = await pool.query(
          `SELECT u.id, u.name, u.email,
                  a.department, a.office_hours, a.contact_email
           FROM tbl_users u
           JOIN advisors a ON a.user_id = u.id
           WHERE u.id = ?`,
          [student_profile.advisor_id]
        );
        advisor = advRows[0] || null;
      }

      return res.send({ user, student_profile, advisor });
    }

    // later: advisor or admin views
    return res.send({ user });
  } catch (err) {
    console.error('Error in /me:', err);
    return res.status(500).send({ message: 'Internal Server Error' });
  }
});


app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/users/:id', async (req, res) => {
    const userId = req.params.id;
    let connection;
    try {
        connection = await pool.getConnection();
        const user = await get_user(connection, userId);
        if (user.length > 0) {
            res.json(user[0]);
        } else {
            res.status(404).send('User not found');
        }
    } catch (err) {
        console.error('Error getting user:', err);
        res.status(500).send('Internal Server Error');
    } finally {
        if (connection) connection.release();
    }
});

app.post('/users', async (req, res) => {
    const { uid, uname, role_id, encrypted_key } = req.body;
    if (!uid || !uname || !role_id || !encrypted_key) {
        return res.status(400).send('Missing required user data');
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await insert_user(connection, uid, uname, role_id, encrypted_key);
        res.status(201).send('User created successfully');
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).send('Internal Server Error');
    } finally {
        if (connection) connection.release();
    }
});

app.put('/users/:id', async (req, res) => {
    const userId = req.params.id;
    const updates = req.body;

    if (Object.keys(updates).length === 0) {
        return res.status(400).send('No update fields provided');
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await update_user(connection, userId, updates);
        res.send('User updated successfully');
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).send('Internal Server Error');
    } finally {
        if (connection) connection.release();
    }
});


app.delete('/users/:id', async (req, res) => {
    const userId = req.params.id;

    let connection;
    try {
        connection = await pool.getConnection();
        await delete_user(connection, userId);
        res.send('User deleted successfully');
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).send('Internal Server Error');
    } finally {
        if (connection) connection.release();
    }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
