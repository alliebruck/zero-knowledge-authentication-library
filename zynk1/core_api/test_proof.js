// test_proofs.js
import { create_random_key, create_pub_key, generate_proof } from './zk.js';
import { bytesToHex } from '@noble/curves/utils.js';
import crypto from 'crypto';

// helper: hex string -> Uint8Array
function hexToBytes(hex) {
  if (!hex || typeof hex !== 'string') throw new Error('hexToBytes requires a string');
  const clean = hex.replace(/^0x/, '');
  if (clean.length % 2 !== 0) throw new Error('Invalid hex length');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

// simulate a \"user\" with stored keys
function createTestUser(email) {
  const secret_key = create_random_key();
  const pub_key = create_pub_key(secret_key);
  return {
    email,
    secret_key,
    pub_key,
    secret_key_hex: bytesToHex(secret_key),
    pub_key_hex: bytesToHex(pub_key)
  };
}

function generateNonceHex() {
  return crypto.randomBytes(32).toString('hex');
}

function logProof(label, user, nonceHex, timestamp) {
  const challenge_bytes = hexToBytes(nonceHex);
  const proof = generate_proof(user.secret_key, user.pub_key, challenge_bytes, timestamp);

  console.log(`\n=== ${label} ===`);
  console.log('email      :', user.email);
  console.log('pub_key_hex:', user.pub_key_hex);
  console.log('nonce_hex  :', nonceHex);
  console.log('timestamp  :', timestamp);
  console.log('proof.r    :', proof.r);
  console.log('proof.s    :', proof.s);
  return proof;
}

async function main() {
  console.log('Testing Zynk proof generation with changing nonces and timestamps...\n');

  const user = createTestUser('alice@example.com');
  const timestamp = Date.now();

  // First "login" with nonce1 and timestamp
  const nonce1 = generateNonceHex();
  const proof1 = logProof('Login 1', user, nonce1, timestamp);

  // Second "login" with nonce2 and timestamp
  const nonce2 = generateNonceHex();
  const proof2 = logProof('Login 2', user, nonce2, timestamp);

  // Third "login" reusing nonce1 and timestamp to show determinism
  const proof3 = logProof('Login 3 (reuse nonce1 and timestamp)', user, nonce1, timestamp);

  console.log('\n=== Summary ===');
  console.log('Same key, different nonces -> proofs should be DIFFERENT:');
  console.log('Login1 vs Login2 same r?', proof1.r === proof2.r);
  console.log('Login1 vs Login2 same s?', proof1.s === proof2.s);

  console.log('\nSame key, same nonce and timestamp -> proofs should be IDENTICAL:');
  console.log('Login1 vs Login3 same r?', proof1.r === proof3.r);
  console.log('Login1 vs Login3 same s?', proof1.s === proof3.s);
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
