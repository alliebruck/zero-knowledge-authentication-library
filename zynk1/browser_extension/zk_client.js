
import { ed25519 } from './node_modules/@noble/curves/ed25519.js';
import { sha512 } from './node_modules/@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from './node_modules/@noble/curves/utils.js';

/**
 * Creates a random 256-bit secret key.
 * @returns {Uint8Array} A 32-byte secret key.
 */
function create_random_key() {
    return ed25519.utils.randomSecretKey();
}

/**
 * Creates a public key from a secret key.
 * @param {Uint8Array} secret_key The secret key.
 * @returns {Uint8Array} The public key.
 */
function create_pub_key(secret_key) {
    return ed25519.getPublicKey(secret_key);
}

/**
 * Generates a Schnorr-like proof of knowledge of the secret key.
 * This is a signature of the public key and a challenge, including a timestamp.
 * @param {Uint8Array} secret_key The secret key.
 * @param {Uint8Array} pub_key The public key.
 * @param {Uint8Array} challenge_bytes The random challenge/nonce.
 * @param {number} timestamp The timestamp in milliseconds.
 * @returns {object} The proof object containing r (as hex) and s (as hex).
 */
function generate_proof(secret_key, pub_key, challenge_bytes, timestamp) {
    // Convert timestamp to 8 bytes (big-endian)
    const ts_bytes = new Uint8Array(8);
    const view = new DataView(ts_bytes.buffer);
    view.setBigUint64(0, BigInt(timestamp));

    // message = H(pub_key || challenge || timestamp)
    const message = new Uint8Array(pub_key.length + challenge_bytes.length + ts_bytes.length);
    message.set(pub_key, 0);
    message.set(challenge_bytes, pub_key.length);
    message.set(ts_bytes, pub_key.length + challenge_bytes.length);

    const signature = ed25519.sign(message, secret_key);
    // The signature is the proof. We can split it into r and s components for clarity if needed.
    // ed25519.sign returns a 64-byte signature (r is 32 bytes, s is 32 bytes)
    const r = signature.slice(0, 32);
    const s = signature.slice(32, 64);
    return { r: bytesToHex(r), s: bytesToHex(s) };
}

export { create_random_key, create_pub_key, generate_proof };
