import { ed25519 } from '@noble/curves/ed25519.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/curves/utils.js';

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
function generate_proof(secret_key, pub_key, challenge_bytes) {
  // message = H(pub_key || challenge)
  const message = new Uint8Array(pub_key.length + challenge_bytes.length);
  message.set(pub_key, 0);
  message.set(challenge_bytes, pub_key.length);

  const signature = ed25519.sign(message, secret_key);
  const r = signature.slice(0, 32);
  const s = signature.slice(32, 64);
  return { r: bytesToHex(r), s: bytesToHex(s) };
}

function verify_proof(pub_key_hex, proof, challenge_bytes) {
  console.log("verify_proof inputs:", { pub_key_hex, proof, challenge_bytes: bytesToHex(challenge_bytes) });
  try {
    const pub_key_bytes = hexToBytes(pub_key_hex);
    const signature_bytes = hexToBytes(proof.r + proof.s);

    const message = new Uint8Array(pub_key_bytes.length + challenge_bytes.length);
    message.set(pub_key_bytes, 0);
    message.set(challenge_bytes, pub_key_bytes.length);

    return ed25519.verify(signature_bytes, message, pub_key_bytes);
  } catch (error) {
    console.error("Error during proof verification:", error);
    return false;
  }
}





export { create_random_key, create_pub_key, generate_proof, verify_proof };