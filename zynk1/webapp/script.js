document.addEventListener('DOMContentLoaded', () => {
    const registerButton = document.getElementById('registerButton');
    const loginButton = document.getElementById('loginButton');
    const registerEmailInput = document.getElementById('registerEmail');
    const loginEmailInput = document.getElementById('loginEmail');
    const registerMessage = document.getElementById('registerMessage');
    const loginMessage = document.getElementById('loginMessage');
    const pubKeyDisplay = document.getElementById('pubKeyDisplay');

    const API_BASE_URL = 'http://localhost:3000';

    // --- REGISTER ---
    registerButton.addEventListener('click', () => {
        const email = registerEmailInput.value;
        if (!email) {
            registerMessage.textContent = 'Please enter an email address.';
            return;
        }
        registerMessage.textContent = 'Generating key and proof in extension...';
        window.postMessage({ type: "ZYNK1_REGISTER", email: email }, "*");
    });

    // --- LOGIN ---
    loginButton.addEventListener('click', () => {
        const email = loginEmailInput.value;
        if (!email) {
            loginMessage.textContent = 'Please enter an email address.';
            return;
        }
        loginMessage.textContent = 'Requesting proof from extension...';
        window.postMessage({ type: "ZYNK1_LOGIN", email: email }, "*");
    });


    // --- LISTEN FOR RESPONSES FROM EXTENSION ---
    window.addEventListener("message", (event) => {
        if (event.source !== window || !event.data.type) {
            return;
        }

        const { type, ...data } = event.data;

        // Handle response from registration
        if (type === "ZYNK1_REGISTER_RESPONSE") {
            if (!data.success) {
                registerMessage.textContent = `Error: ${data.error}`;
                return;
            }

            const { pub_key, proof, email } = data;
            pubKeyDisplay.textContent = `Public Key for ${email}: ${pub_key}`;
            
            registerMessage.textContent = 'Key and proof received. Registering with server...';
            fetch(`${API_BASE_URL}/register_zk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pub_key, proof, email })
            }).then(res => {
                if (!res.ok) {
                    return res.json().then(err => { throw new Error(err.message || 'Registration failed') });
                }
                return res.json();
            }).then(apiResponse => {
                registerMessage.textContent = apiResponse.message;
                 if(data.alreadyExists) {
                    loginMessage.textContent = "You already have an account. Please login.";
                }
            }).catch(err => {
                registerMessage.textContent = `Error: ${err.message}`;
            });
        }

        // Handle response from login
        if (type === "ZYNK1_LOGIN_RESPONSE") {
            if (!data.success) {
                loginMessage.textContent = `Error: ${data.error}`;
                return;
            }

            const { proof, pub_key, email } = data;
            pubKeyDisplay.textContent = `Public Key for ${email}: ${pub_key}`;

            loginMessage.textContent = 'Proof received. Logging in...';
            fetch(`${API_BASE_URL}/login_zk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pub_key, proof })
            }).then(res => {
                if (!res.ok) {
                    return res.json().then(err => { throw new Error(err.message || 'Login failed') });
                }
                return res.json();
            }).then(apiResponse => {
                loginMessage.textContent = apiResponse.message;
                // Store user data for the dashboard
                if (apiResponse.user) {
                    sessionStorage.setItem('loggedInUser', JSON.stringify(apiResponse.user));
                }
                window.location.href = 'dashboard.html';
            }).catch(err => {
                loginMessage.textContent = `Error: ${err.message}`;
            });
        }
    });
});