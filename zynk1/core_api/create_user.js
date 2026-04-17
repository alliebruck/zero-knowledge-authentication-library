
import express from 'express';
import { pool, insert_user, createStudentProfile } from './db_ops.js';
import { verify_proof } from './zk.js';

const router = express.Router();

/**
 * Endpoint: /create_user
 * Parameters: uname (Public Key or UID), email, name, proof, timestamp
 * Description: Simplified registration endpoint that uses ZKP.
 */
router.post('/create_user', async (req, res) => {
    const { uname, email, name, proof, timestamp } = req.body;

    if (!uname || !email || !proof || !timestamp) {
        return res.status(400).send({ message: 'Missing uname, email, proof, or timestamp' });
    }

    try {
        // ZKP Freshness check
        const THRESHOLD = 5 * 60 * 1000;
        if (Math.abs(Date.now() - timestamp) > THRESHOLD) {
            return res.status(401).send({ message: 'Timestamp expired' });
        }

        // Use the static challenge for registration
        const static_challenge_bytes = new Uint8Array(32).fill(0x01);
        const is_valid = verify_proof(uname, proof, static_challenge_bytes, timestamp);

        if (!is_valid) {
            return res.status(401).send({ message: 'Invalid ZKP proof' });
        }

        // Check if user exists
        const [existing] = await pool.query('SELECT id FROM tbl_users WHERE email = ?', [email]);
        if (existing.length) {
            return res.status(409).send({ message: 'User with this email already exists' });
        }

        const connection = await pool.getConnection();
        try {
            const user = await insert_user(connection, uname, email, 3, uname); // Default to student (role 3)
            await createStudentProfile({
                user_id: user.id,
                major: 'Undeclared',
                gpa: 0.0,
                classes: '[]',
                extra_info: 'New student created via create_user.js'
            });

            return res.status(201).send({ message: 'User created successfully', user });
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error('Error in /create_user:', err);
        return res.status(500).send({ message: 'Internal Server Error' });
    }
});

export default router;
