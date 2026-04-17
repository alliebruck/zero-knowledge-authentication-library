import { create_random_key, create_pub_key, generate_proof } from './zk_client.js';
import { bytesToHex } from './node_modules/@noble/curves/utils.js';

console.log("Zynk1 Authenticator background script loaded.");


async function generateChallengeProofForEmail(email) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get('users', async (data) => {
      try {
        const user = data.users ? data.users[email] : null;
        if (!user || !user.secret_key || !user.pub_key) {
          return reject(new Error("No secret key found for this email."));
        }

        // 1. Ask backend for a fresh challenge
        const challengeRes = await fetch('http://localhost:3000/login_challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',                     // <-- add this
            body: JSON.stringify({ email })
        });

        if (!challengeRes.ok) {
          const errBody = await challengeRes.json().catch(() => ({}));
          throw new Error(errBody.message || 'Failed to get login challenge');
        }
        const { nonce } = await challengeRes.json();
        if (!nonce) throw new Error('No nonce in challenge response');

        // 2. Build keys + challenge bytes + timestamp
        const secret_key = new Uint8Array(user.secret_key.match(/.{1,2}/g).map(b => parseInt(b, 16)));
        const pub_key = new Uint8Array(user.pub_key.match(/.{1,2}/g).map(b => parseInt(b, 16)));
        const challenge_bytes = new Uint8Array(nonce.match(/.{1,2}/g).map(b => parseInt(b, 16)));
        const timestamp = Date.now();

        // 3. Generate proof with challenge and timestamp
        const proof = generate_proof(secret_key, pub_key, challenge_bytes, timestamp);

        resolve({ proof, pub_key: user.pub_key, nonce, timestamp });
      } catch (e) {
        reject(e);
      }
    });
  });
}

const static_challenge_bytes = new Uint8Array(32).fill(0x01); // A static 32-byte challenge for registration

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, email } = request;

  if (action === "generateAndStoreKeysForEmail") {
    if (!email) {
      sendResponse({ success: false, error: "Email is required." });
      return false;
    }

    chrome.storage.local.get('users', (data) => {
      const users = data.users || {};
      
      // If user already exists, generate a proof for them and return.
      if (users[email]) {
        const existing_user = users[email];
        const secret_key = new Uint8Array(existing_user.secret_key.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const pub_key = new Uint8Array(existing_user.pub_key.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const timestamp = Date.now();
        // For registration you *can* still use static proof, or also switch to challenge if you want
        const proof = generate_proof(secret_key, pub_key, static_challenge_bytes, timestamp); // Pass static challenge and timestamp
        sendResponse({ success: true, pub_key: existing_user.pub_key, proof: proof, alreadyExists: true, email: email, timestamp: timestamp });
        return;
      }

      // If user is new, generate keys, store them, and generate a proof.
      const secret_key = create_random_key();
      const pub_key = create_pub_key(secret_key);
      const timestamp = Date.now();
      const proof = generate_proof(secret_key, pub_key, static_challenge_bytes, timestamp); // Pass static challenge and timestamp

      const secret_key_hex = bytesToHex(secret_key);
      const pub_key_hex = bytesToHex(pub_key);

      users[email] = { secret_key: secret_key_hex, pub_key: pub_key_hex };

      chrome.storage.local.set({ users: users }, () => {
        console.log(`New keypair generated and stored for ${email}.`);
        sendResponse({ success: true, pub_key: pub_key_hex, proof: proof, alreadyExists: false, email: email, timestamp: timestamp });
      });
    });
    return true; // async response

  } else if (action === "getPublicKeyForEmail") {
    if (!email) {
      sendResponse({ success: false, error: "Email is required." });
      return false;
    }
    chrome.storage.local.get('users', (data) => {
      const user = data.users ? data.users[email] : null;
      if (user && user.pub_key) {
        sendResponse({ success: true, pub_key: user.pub_key });
      } else {
        sendResponse({ success: false, error: "No public key found for this email." });
      }
    });
    return true;

  } else if (action === "generateProofForEmail") {
    if (!email) {
      sendResponse({ success: false, error: "Email is required." });
      return false;
    }

    // LOGIN: challenge–response proof
    generateChallengeProofForEmail(email)
      .then(({ proof, pub_key, nonce, timestamp }) => {
        console.log(`Challenge-based proof generated for ${email}:`, proof);
        sendResponse({ success: true, proof, pub_key, email, nonce, timestamp });
      })
      .catch(err => {
        console.error("Error generating challenge-based proof:", err);
        sendResponse({ success: false, error: err.message });
      });

    return true;

  } else if (action === "getAllUsers") {
    chrome.storage.local.get('users', (data) => {
      sendResponse({ success: true, users: data.users || {} });
    });
    return true;
  }
});

const PROVER_PAGE_PATH = 'prover.html';
let proverWindowId = null;

// Helper function to find or create the prover window.
async function getProverWindow() {
  if (proverWindowId) {
    try {
      const win = await chrome.windows.get(proverWindowId);
      console.log("Prover window already exists.");
      return proverWindowId;
    } catch (e) {
      console.log("Prover window was closed, will create a new one.");
      proverWindowId = null;
    }
  }

  console.log("Creating new prover window.");
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL(PROVER_PAGE_PATH),
    type: 'popup',
    width: 100,
    height: 100,
    left: 0,
    top: 0,
    focused: false,
  });

  proverWindowId = win.id;
  await new Promise(resolve => setTimeout(resolve, 500));
  return proverWindowId;
}

// Listen for connections from content scripts
chrome.runtime.onConnect.addListener(port => {
  if (port.name === "zynk1-content-script") {
    console.log("Content script connected via port.");

    port.onMessage.addListener(async (request) => {
      const { action, payload } = request;

      if (action === "storeSecret") {
        console.log("Background script received request to store secret.");
        try {
          await chrome.storage.local.set({ secret: payload.secret });
          console.log("Secret stored successfully.");
          port.postMessage({ type: "ZYNK1_STORE_SECRET_RESPONSE", success: true });
        } catch (error) {
          console.error("Error storing secret:", error);
          port.postMessage({ type: "ZYNK1_STORE_SECRET_RESPONSE", error: error.message });
        }

      } else if (action === "generateProof") {
        console.log("Background script received request to generate a proof for UID:", payload.uid);
        if (!payload || typeof payload.uid === 'undefined') {
          port.postMessage({ type: "ZYNK1_PROOF_RESPONSE", error: "Missing UID in generateProof request payload." });
          return;
        }
        try {
          // 1. Ensure the prover window is ready.
          await getProverWindow();

          // 2. Send a message to the extension (which the prover page will hear)
          const response = await chrome.runtime.sendMessage({
            action: "generateProof",
            payload: { uid: payload.uid }
          });

          // 3. Handle the response from the prover page
          if (response.status === "success") {
            port.postMessage({ type: "ZYNK1_PROOF_RESPONSE", proof: response.proof, publicSignals: response.publicSignals });
          } else {
            throw new Error(response.message || "An unknown error occurred in the prover.");
          }

        } catch (error) {
          console.error("Error in background script during proof generation:", error);
          port.postMessage({ type: "ZYNK1_PROOF_RESPONSE", error: error.message });
        }
      }
    });

    port.onDisconnect.addListener(() => {
      console.log("Content script disconnected from port.");
    });
  }
});

// Optional: Close the prover window when the browser is closed
chrome.windows.onRemoved.addListener(windowId => {
  if (windowId === proverWindowId) {
    console.log("Prover window was closed.");
    proverWindowId = null;
  }
});
