
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
 * This is a signature of the public key.
 * @param {Uint8Array} secret_key The secret key.
 * @param {Uint8Array} pub_key The public key.
 * @returns {object} The proof object containing r (as hex) and s (as hex).
 */
function generate_proof(secret_key, pub_key) {
    const message = pub_key; // Using public key as the message to be signed
    const signature = ed25519.sign(message, secret_key);
    // The signature is the proof. We can split it into r and s components for clarity if needed.
    // ed25519.sign returns a 64-byte signature (r is 32 bytes, s is 32 bytes)
    const r = signature.slice(0, 32);
    const s = signature.slice(32, 64);
    return { r: bytesToHex(r), s: bytesToHex(s) };
}

export { create_random_key, create_pub_key, generate_proof };
