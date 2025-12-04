
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import * as snarkjs from 'snarkjs';
import fs from 'fs';
const app = express();
const port = 3000;
import { pool, get_user, insert_user, update_user, delete_user } from './db_ops.js';
import { verify_proof } from './zk.js';
import { register_user, find_user_by_pub_key, find_user_by_email } from './user.js';

app.use(express.json());

app.use(cors());

app.post('/register_zk', async (req, res) => {
    const { pub_key, proof, email } = req.body;

    if (!pub_key || !proof || !email) {
        return res.status(400).send('Email, public key, and proof are required');
    }

    try {
        const is_valid = verify_proof(pub_key, proof);

        if (is_valid) {
            const user = register_user(pub_key, email);
            res.status(201).send({ message: 'User registered successfully', user });
        } else {
            res.status(401).send('Invalid proof. Registration failed.');
        }
    } catch (err) {
        if (err.message.includes('already exists')) {
            return res.status(409).send({ message: err.message });
        }
        console.error('Error during registration:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/login_zk', async (req, res) => {
    const { pub_key, proof } = req.body;

    if (!pub_key || !proof) {
        return res.status(400).send('Public key and proof are required');
    }

    try {
        const is_valid = verify_proof(pub_key, proof);

        if (is_valid) {
            const user = find_user_by_pub_key(pub_key);
            if (user) {
                res.status(200).send({ message: 'Login successful', user });
            } else {
                res.status(401).send('Proof is valid, but user is not registered.');
            }
        } else {
            res.status(401).send('Invalid proof. Login failed.');
        }
    } catch (err) {
        console.error('Error verifying proof:', err);
        res.status(500).send('Internal Server Error');
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

app.post('/login', async (req, res) => {
    const { proof, publicSignals } = req.body;

    if (!proof || !publicSignals) {
        return res.status(400).send('Proof and public signals are required');
    }

    let connection;
    try {
        const vkey = JSON.parse(fs.readFileSync("circuits/verification_key.json"));
        const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

        if (isValid) {
            // Extract public hash from signals and check if it exists in the DB
            const publicHash = publicSignals[0];
            connection = await pool.getConnection();
            const [rows] = await connection.query('SELECT * FROM tbl_users WHERE encrypted_key = ?', [publicHash]);
           
            if (rows.length > 0) {
                res.status(200).send('Login successful');
            } else {
                res.status(401).send('Proof is valid, but user is not registered.');
            }
        } else {
            res.status(401).send('Invalid proof. Login failed.');
        }
    } catch (err) {
        console.error('Error verifying proof:', err);
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
