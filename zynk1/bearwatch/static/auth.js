// BearWatch Trading Auth
// Uses Web Crypto API (Ed25519) — same primitive as @noble/curves in the Zynk1 extension.
// Keys are stored in localStorage and optionally synced with the browser extension.

const AUTH_KEY = 'bearwatch_auth';

function bytesToHex(bytes) {
    return Array.from(new Uint8Array(bytes))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        out[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return out;
}

async function generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const pubRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const privPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    // Raw 32-byte secret key starts at offset 16 in PKCS8 DER for Ed25519
    const privBytes = new Uint8Array(privPkcs8).slice(16, 48);
    return {
        publicKey: bytesToHex(new Uint8Array(pubRaw)),
        privateKey: bytesToHex(privBytes),
    };
}

async function importPrivateKey(hexKey) {
    const rawKey = hexToBytes(hexKey);
    // Reconstruct PKCS8 DER wrapper for Ed25519
    const pkcs8 = new Uint8Array([
        0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
        0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
        ...rawKey
    ]);
    return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
}

async function fetchAuthChallenge() {
    const resp = await fetch('/api/auth/challenge', { method: 'POST' });
    const challenge = await resp.json();
    if (!resp.ok || !challenge.challenge || !challenge.timestamp) {
        throw new Error(challenge.error || 'Could not create authentication challenge.');
    }
    return challenge;
}

async function generateProof(privateKeyHex, publicKeyHex, challengeHex, timestamp) {
    const privateKey = await importPrivateKey(privateKeyHex);
    const pubKeyBytes = hexToBytes(publicKeyHex);
    const challengeBytes = hexToBytes(challengeHex);
    const timestampBytes = new Uint8Array(8);
    new DataView(timestampBytes.buffer).setBigUint64(0, BigInt(timestamp));
    const message = new Uint8Array(pubKeyBytes.length + challengeBytes.length + timestampBytes.length);
    message.set(pubKeyBytes);
    message.set(challengeBytes, pubKeyBytes.length);
    message.set(timestampBytes, pubKeyBytes.length + challengeBytes.length);
    const signature = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, message);
    const sigBytes = new Uint8Array(signature);
    return {
        r: bytesToHex(sigBytes.slice(0, 32)),
        s: bytesToHex(sigBytes.slice(32, 64)),
    };
}

function saveCredentials(email, pubKey, privKey) {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ email, pubKey, privKey }));
}

function loadCredentials() {
    try {
        const raw = localStorage.getItem(AUTH_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function clearCredentials() {
    localStorage.removeItem(AUTH_KEY);
}

// Ask the Zynk1 extension (content.js) for stored accounts via postMessage.
// Returns extension status and accounts, or installed=false if it does not respond.
async function getExtensionAccounts() {
    return new Promise((resolve) => {
        let attempts = 0;
        const timer = setTimeout(() => {
            window.removeEventListener('message', handler);
            clearInterval(retryTimer);
            resolve({ installed: false, accounts: [] });
        }, 2500);

        function handler(event) {
            if (event.data && event.data.type === 'ZYNK1_ACCOUNTS_RESPONSE') {
                clearTimeout(timer);
                clearInterval(retryTimer);
                window.removeEventListener('message', handler);
                const extension = {
                    installed: Boolean(event.data.installed),
                    accounts: event.data.accounts || [],
                };
                updateExtensionStatus(extension);
                resolve(extension);
            } else if (event.data && event.data.type === 'ZYNK1_EXTENSION_READY') {
                requestAccounts();
            }
        }

        function requestAccounts() {
            attempts += 1;
            console.log(`BearWatch requesting Zynk1 extension accounts. Attempt ${attempts}`);
            window.postMessage({ type: 'ZYNK1_GET_ACCOUNTS', source: 'bearwatch' }, '*');
        }

        window.addEventListener('message', handler);
        requestAccounts();
        const retryTimer = setInterval(requestAccounts, 400);
    });
}

function updateExtensionStatus(extension) {
    const accounts = extension.accounts || [];
    const message = extension.installed
        ? `✅ Zynk extension connected (${accounts.length} account${accounts.length !== 1 ? 's' : ''})`
        : '⚠️ Extension not detected — using local key storage';

    const loginStatus = document.getElementById('ext-status-login');
    const registerStatus = document.getElementById('ext-status-register');
    if (loginStatus) loginStatus.textContent = message;
    if (registerStatus) registerStatus.textContent = message;

    console.log('BearWatch extension status:', message);
}

// Store newly registered credentials in the extension if available.
function notifyExtensionNewUser(email, pubKey, privKey) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            window.removeEventListener('message', handler);
            resolve({ success: false, error: 'Extension did not confirm account storage.' });
        }, 2000);

        function handler(event) {
            if (event.data && event.data.type === 'ZYNK1_STORE_USER_RESPONSE') {
                clearTimeout(timer);
                window.removeEventListener('message', handler);
                resolve(event.data);
            }
        }

        window.addEventListener('message', handler);
        window.postMessage({ type: 'ZYNK1_STORE_USER', source: 'bearwatch', email, pubKey, privKey }, '*');
    });
}
