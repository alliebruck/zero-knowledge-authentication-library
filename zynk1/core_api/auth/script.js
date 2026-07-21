document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    const tabs = document.querySelectorAll('.auth-tab');
    const forms = document.querySelectorAll('.auth-form');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // Update tab states
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update form visibility
            forms.forEach(form => {
                form.classList.remove('active');
                if (form.id === `${targetTab}Form`) {
                    form.classList.add('active');
                }
            });

            // Clear messages
            document.querySelectorAll('.message').forEach(msg => {
                msg.classList.remove('show');
                msg.textContent = '';
            });
        });
    });

    // Form elements
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');
    const registerEmailInput = document.getElementById('registerEmail');
    const registerNameInput = document.getElementById('registerName');
    const registerRoleSelect = document.getElementById('registerRole');
    const loginEmailInput = document.getElementById('loginEmail');
    const registerMessage = document.getElementById('registerMessage');
    const loginMessage = document.getElementById('loginMessage');

    // Fetch config and populate roles
    fetch('/config')
        .then(res => res.json())
        .then(config => {
            // Role population
            const roleGroup = registerRoleSelect.closest('.form-group');
            if (config.roles && Array.isArray(config.roles) && config.roles.length > 0) {
                registerRoleSelect.innerHTML = '';
                config.roles.forEach(role => {
                    const option = document.createElement('option');
                    option.value = role.toLowerCase();
                    option.textContent = role;
                    registerRoleSelect.appendChild(option);
                });
                if (roleGroup) roleGroup.style.display = 'block';
            } else {
                if (roleGroup) roleGroup.style.display = 'none';
            }

            // Auth methods visibility
            if (config.auth_methods) {
                const extensionBtn = document.querySelector('#loginForm .btn-primary');
                const appBtn = document.getElementById('loginWithAppBtn');
                const divider = document.querySelector('.auth-divider');

                if (config.auth_methods.browser_extension === false) {
                    if (extensionBtn) extensionBtn.style.display = 'none';
                    if (divider) divider.style.display = 'none';
                }

                if (config.auth_methods.authentication_app === false) {
                    if (appBtn) appBtn.style.display = 'none';
                    if (divider) divider.style.display = 'none';
                }
            }
        })
        .catch(err => {
            console.error('Failed to load config:', err);
            const roleGroup = registerRoleSelect.closest('.form-group');
            if (roleGroup) roleGroup.style.display = 'none';
        });

    const API_BASE_URL = window.location.origin;
    const WEBAPP_URL = 'http://localhost:3001';

    // Helper function to show messages
    function showMessage(element, message, isError = false) {
        element.textContent = message;
        element.className = `message show ${isError ? 'error' : 'success'}`;
    }

    // --- REGISTER ---
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const email = registerEmailInput.value.trim();
        const name = registerNameInput.value.trim();
        const role = registerRoleSelect.value;

        if (!email) {
            showMessage(registerMessage, 'Please enter an email address.', true);
            return;
        }
        if (!name) {
            showMessage(registerMessage, 'Please enter your full name.', true);
            return;
        }

        showMessage(registerMessage, 'Generating cryptographic keys via extension...', false);

        // Store additional user info for later
        sessionStorage.setItem('pendingRegistration', JSON.stringify({ name, role }));

        window.postMessage({ type: "ZYNK1_REGISTER", email: email }, "*");
    });

    // --- LOGIN ---
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const email = loginEmailInput.value.trim();

        if (!email) {
            showMessage(loginMessage, 'Please enter an email address.', true);
            return;
        }

        showMessage(loginMessage, 'Verifying your cryptographic credentials...', false);
        window.postMessage({ type: "ZYNK1_LOGIN", email: email }, "*");
    });

    // --- LISTEN FOR RESPONSES FROM EXTENSION ---
    window.addEventListener("message", (event) => {
        // We only care about our own messages
        if (!event.data || !event.data.type) return;

        const { type, ...data } = event.data;

        // Handle response from registration
        if (type === "ZYNK1_REGISTER_RESPONSE") {
            console.log("Zynk1: Received registration response", data);
            if (!data.success) {
                showMessage(registerMessage, `Extension Error: ${data.error}`, true);
                return;
            }

            const { pub_key, proof, email } = data;
            const pendingData = JSON.parse(sessionStorage.getItem('pendingRegistration') || '{}');

            showMessage(registerMessage, 'Registering with server...', false);

            fetch(`${API_BASE_URL}/register_zk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pub_key,
                    proof,
                    email,
                    name: pendingData.name || email.split('@')[0],
                    role: pendingData.role || 'student'
                })
            }).then(res => {
                if (!res.ok) {
                    return res.json().then(err => { throw new Error(err.message || 'Registration failed') });
                }
                return res.json();
            }).then(apiResponse => {
                sessionStorage.removeItem('pendingRegistration');
                showMessage(registerMessage, 'Registration successful! Logging you in...', false);

                // Auto-login after registration using the token from API
                if (apiResponse.token) {
                    if (apiResponse.user) {
                        sessionStorage.setItem('loggedInUser', JSON.stringify(apiResponse.user));
                    }
                    setTimeout(() => {
                        window.location.href = `${WEBAPP_URL}/?token=${apiResponse.token}`;
                    }, 1000);
                } else {
                    // Fallback to manual login
                    setTimeout(() => {
                        const loginTab = document.querySelector('[data-tab="login"]');
                        if (loginTab) loginTab.click();
                        loginEmailInput.value = email;
                    }, 1500);
                }
            }).catch(err => {
                showMessage(registerMessage, `Server Error: ${err.message}`, true);
            });
        }

        // Handle response from login
        if (type === "ZYNK1_LOGIN_RESPONSE") {
            console.log("Zynk1: Received login response", data);
            if (!data.success) {
                showMessage(loginMessage, `Extension Error: ${data.error}`, true);
                return;
            }

            const { proof, pub_key, email } = data;

            showMessage(loginMessage, 'Verifying proof with server...', false);

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
                showMessage(loginMessage, 'Login successful! Redirecting to Web App...', false);

                // Store user data
                if (apiResponse.user) {
                    sessionStorage.setItem('loggedInUser', JSON.stringify(apiResponse.user));
                }
                
                setTimeout(() => {
                    window.location.href = `${WEBAPP_URL}/?token=${apiResponse.token}`;
                }, 1000);
            }).catch(err => {
                showMessage(loginMessage, `Server Error: ${err.message}`, true);
            });
        }
    });

    const loginWithAppBtn = document.getElementById('loginWithAppBtn');

    if (loginWithAppBtn) {
        loginWithAppBtn.addEventListener('click', () => {
            const redirectUri = 'http://localhost:3001'; // The webapp
            const authAppUrl = 'http://localhost:3002'; // The new auth_redirect_app
            window.location.href = `${authAppUrl}/index.html?redirect_uri=${encodeURIComponent(redirectUri)}&state=xyz`;
        });
    }

    // Check if extension is available
    let extensionDetected = false;
    setTimeout(() => {
        if (!extensionDetected) {
            console.warn("Zynk1: Extension not detected after 2 seconds.");
            // We could show a warning UI here if needed
        }
    }, 2000);
    
    // The extension can signal it's ready by saying hi
    window.addEventListener("message", (event) => {
        if (event.data && event.data.type === "ZYNK1_EXTENSION_READY") {
            extensionDetected = true;
            console.log("Zynk1: Extension detected and ready.");
        }
    });
});
