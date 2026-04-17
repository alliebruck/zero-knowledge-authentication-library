
import express from 'express';
import { pool } from './db_ops.js';
import { verify_proof } from './zk.js';
import { hexToBytes } from '@noble/curves/utils.js';

const router = express.Router();

/**
 * Endpoint: /auth
 * Parameters: uname (Public Key or UID), proof, nonce, timestamp
 * Description: Simplified ZKP authentication endpoint.
 */
router.post('/auth', async (req, res) => {
    const { uname, proof, nonce, timestamp } = req.body;

    if (!uname || !proof || !nonce || !timestamp) {
        return res.status(400).send({ message: 'Missing uname, proof, nonce, or timestamp' });
    }

    try {
        // ZKP Freshness check
        const THRESHOLD = 60 * 1000;
        if (Math.abs(Date.now() - timestamp) > THRESHOLD) {
            return res.status(401).send({ message: 'Timestamp expired' });
        }

        const challenge_bytes = hexToBytes(nonce);
        const is_valid = verify_proof(uname, proof, challenge_bytes, timestamp);

        if (!is_valid) {
            return res.status(401).send({ message: 'Invalid ZKP proof' });
        }

        // Authentication successful, lookup the user
        const [rows] = await pool.query('SELECT * FROM tbl_users WHERE uid = ?', [uname]);
        const user = rows[0];

        if (!user) {
            return res.status(404).send({ message: 'User not found' });
        }

        // Establish the session
        req.session.userId = user.id;

        return res.status(200).send({ message: 'Authentication successful', user });
    } catch (err) {
        console.error('Error in /auth:', err);
        return res.status(500).send({ message: 'Internal Server Error' });
    }
});

export default router;
