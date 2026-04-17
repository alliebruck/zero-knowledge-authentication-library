
import { create_random_key, create_pub_key, generate_proof } from './zk.js';
import { bytesToHex } from '@noble/curves/utils.js';

async function test_profile() {
    console.log('Running Profile & Advisor Assignment test...');

    const secret_key = create_random_key();
    const pub_key = create_pub_key(secret_key);
    const static_challenge_bytes = new Uint8Array(32).fill(0x01);
    const timestamp = Date.now();
    const proof = generate_proof(secret_key, pub_key, static_challenge_bytes, timestamp);

    const pub_key_hex = bytesToHex(pub_key);
    const email = `test-profile-${Date.now()}@example.com`;
    const name = "Profile Tester";

    // 1. Register with Zynk (this creates the student profile)
    console.log('1. Registering new student...');
    const reg_res = await fetch('http://localhost:3000/register_zk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:8000' },
        body: JSON.stringify({ pub_key: pub_key_hex, proof, email, name, timestamp })
    });
    
    // LOGIN to get a session
    console.log('2. Logging in to establish session...');
    const chal_res = await fetch('http://localhost:3000/login_challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:8000' },
        body: JSON.stringify({ email })
    });
    const { nonce } = await chal_res.json();
    const nonce_bytes = new Uint8Array(nonce.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const login_timestamp = Date.now();
    const login_proof = generate_proof(secret_key, pub_key, nonce_bytes, login_timestamp);

    const login_res = await fetch('http://localhost:3000/login_zk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:8000' },
        body: JSON.stringify({ pub_key: pub_key_hex, proof: login_proof, email, nonce, timestamp: login_timestamp })
    });
    
    const setCookie = login_res.headers.get('set-cookie');
    const cookie = setCookie ? setCookie.split(';')[0] : '';
    console.log('Login successful, got session cookie:', cookie);

    // 3. Update Profile
    console.log('3. Testing /update_student_profile...');
    const update_res = await fetch('http://localhost:3000/update_student_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:8000', 'Cookie': cookie },
        body: JSON.stringify({ major: 'Computer Science', gpa: 3.9, classes: '["CS101", "CS202"]', extra_info: 'Enthusiastic student' })
    });
    if (!update_res.ok) {
        console.error('Update Profile Failed:', await update_res.text());
        return;
    }
    console.log('Update response:', await update_res.json());

    // 4. Assign Advisor
    console.log('4. Testing /assign_advisor...');
    const assign_res = await fetch('http://localhost:3000/assign_advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:8000', 'Cookie': cookie }
    });
    console.log('Assign advisor response:', await assign_res.json());

    // 5. Check /me to verify everything is joined
    console.log('5. Testing /me to verify joined data...');
    const me_res = await fetch('http://localhost:3000/me', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:8000', 'Cookie': cookie }
    });
    const me_data = await me_res.json();
    console.log('Dashboard Data (/me):', JSON.stringify(me_data, null, 2));

    console.log('\nProfile test finished.');
}

test_profile();
