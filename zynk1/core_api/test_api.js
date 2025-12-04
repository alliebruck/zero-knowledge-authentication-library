
import { create_random_key, create_pub_key, generate_proof } from './zk.js';
import { bytesToHex } from '@noble/curves/utils.js';

async function test_api() {
    console.log('Running API test...');

    // 1. Generate a new keypair and proof
    const secret_key = create_random_key();
    const pub_key = create_pub_key(secret_key);
    const proof = generate_proof(secret_key, pub_key);

    const pub_key_hex = bytesToHex(pub_key);

    // 2. Register the user
    console.log('Testing /register_zk...');
    try {
        const reg_res = await fetch('http://localhost:3000/register_zk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pub_key: pub_key_hex, proof })
        });
        const reg_data = await reg_res.json();
        console.log('Registration response:', reg_data);
        if (reg_res.status !== 201) {
            console.error('Registration failed!');
            return;
        }
    } catch (e) {
        console.error('Error during registration test:', e.message);
        return;
    }


    // 3. Login with the same credentials
    console.log('\nTesting /login_zk...');
    try {
        const login_res = await fetch('http://localhost:3000/login_zk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pub_key: pub_key_hex, proof })
        });
        const login_data = await login_res.json();
        console.log('Login response:', login_data);
        if (login_res.status !== 200) {
            console.error('Login failed!');
            return;
        }
    } catch (e) {
        console.error('Error during login test:', e.message);
    }

    console.log('\nAPI test finished.');
}

test_api();
