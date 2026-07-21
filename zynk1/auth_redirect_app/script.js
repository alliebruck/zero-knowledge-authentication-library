import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes } from '@noble/curves/utils.js';

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const tabs = document.querySelectorAll('.auth-tab');
    const forms = document.querySelectorAll('.auth-form');
    const authFormsContainer = document.getElementById('authForms');
    const accountSelector = document.getElementById('accountSelector');
    const accountList = document.getElementById('accountList');
    const showRegisterBtn = document.getElementById('showRegisterBtn');

    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');
    const registerMessage = document.getElementById('registerMessage');
    const loginMessage = document.getElementById('loginMessage');

    const API_BASE_URL = 'http://localhost:3000';
    
    // Parse URL parameters for redirect flow
    const urlParams = new URLSearchParams(window.location.search);
    const redirectUri = urlParams.get('redirect_uri');
    const state = urlParams.get('state');

    // --- UTILS ---
    function showMessage(element, message, isError = false) {
        element.textContent = message;
        element.className = `message show ${isError ? 'error' : 'success'}`;
    }

    function getStoredAccounts() {
        try {
            return JSON.parse(localStorage.getItem('zync_accounts') || '{}');
        } catch (e) {
            return {};
        }
    }

    function storeAccount(email, name, secretKeyHex, pubKeyHex) {
        const accounts = getStoredAccounts();
        accounts[email] = { name, secretKey: secretKeyHex, pubKey: pubKeyHex };
        localStorage.setItem('zync_accounts', JSON.stringify(accounts));
    }

    // --- CRYPTO ---
    function generateProof(secretKeyHex, pubKeyHex) {
        const secretKey = hexToBytes(secretKeyHex);
        const pubKey = hexToBytes(pubKeyHex);
        const signature = ed25519.sign(pubKey, secretKey);
        const r = signature.slice(0, 32);
        const s = signature.slice(32, 64);
        return { r: bytesToHex(r), s: bytesToHex(s) };
    }

    // --- UI LOGIC ---
    function renderAccounts() {
        const accounts = getStoredAccounts();
        const emails = Object.keys(accounts);

        if (emails.length > 0) {
            accountSelector.classList.remove('hidden');
            authFormsContainer.classList.add('hidden');
            accountList.innerHTML = '';

            emails.forEach(email => {
                const acc = accounts[email];
                const li = document.createElement('li');
                li.className = 'account-item';
                li.innerHTML = `
                    <div class="account-info">
                        <span class="account-email">${email}</span>
                        <span class="account-name">${acc.name || 'User'}</span>
                    </div>
                `;
                li.addEventListener('click', () => loginWithAccount(email));
                accountList.appendChild(li);
            });
        } else {
            accountSelector.classList.add('hidden');
            authFormsContainer.classList.remove('hidden');
        }
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            forms.forEach(f => {
                f.classList.remove('active');
                if (f.id === `${tab.dataset.tab}Form`) f.classList.add('active');
            });
        });
    });

    showRegisterBtn.addEventListener('click', () => {
        accountSelector.classList.add('hidden');
        authFormsContainer.classList.remove('hidden');
    });

    // --- AUTH ACTIONS ---

    async function loginWithAccount(email) {
        const accounts = getStoredAccounts();
        const acc = accounts[email];
        if (!acc) return;

        try {
            console.log("Logging in with stored account:", email);
            const proof = generateProof(acc.secretKey, acc.pubKey);

            const response = await fetch(`${API_BASE_URL}/login_zk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pub_key: acc.pubKey, proof })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Login failed');
            }

            const data = await response.json();
            handleSuccess(data.token);
        } catch (err) {
            alert(`Login error: ${err.message}`);
        }
    }

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('registerEmail').value;
        const name = document.getElementById('registerName').value;
        const role = document.getElementById('registerRole').value;

        showMessage(registerMessage, 'Generating keys and proof...');

        try {
            const secretKey = ed25519.utils.randomSecretKey();
            const pubKey = ed25519.getPublicKey(secretKey);
            const secretKeyHex = bytesToHex(secretKey);
            const pubKeyHex = bytesToHex(pubKey);
            const proof = generateProof(secretKeyHex, pubKeyHex);

            showMessage(registerMessage, 'Registering with server...');

            const response = await fetch(`${API_BASE_URL}/register_zk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pub_key: pubKeyHex,
                    proof,
                    email,
                    name,
                    role
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Registration failed');
            }

            const data = await response.json();
            storeAccount(email, name, secretKeyHex, pubKeyHex);
            showMessage(registerMessage, 'Registration successful!');
            handleSuccess(data.token);
        } catch (err) {
            showMessage(registerMessage, err.message, true);
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;

        const accounts = getStoredAccounts();
        const acc = accounts[email];

        if (!acc) {
            showMessage(loginMessage, 'Account not found in this app. Please register first.', true);
            return;
        }

        showMessage(loginMessage, 'Generating proof...');
        await loginWithAccount(email);
    });

    function handleSuccess(token) {
        if (redirectUri) {
            const url = new URL(redirectUri);
            url.searchParams.set('token', token);
            if (state) url.searchParams.set('state', state);
            showMessage(loginMessage || registerMessage, 'Success! Redirecting back...');
            setTimeout(() => {
                window.location.href = url.toString();
            }, 1000);
        } else {
            showMessage(loginMessage || registerMessage, `Success! Your token is: ${token}`);
        }
    }

    renderAccounts();
});
