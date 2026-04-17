// webapi.js

// Global config and internal handlers
const ZynkWebAPI = {
  // Backend endpoint for ZK login
  loginEndpoint: "http://localhost:3000/login_zk",

  // Optional hooks
  onLoginSuccess: null,      // function(user)
  onLoginFailure: null,      // function(errorMessageOrError)
  onRegisterSuccess: null,
  onRegisterFailure: null,

  // Internal handlers set by widgets
  _loginHandler: null,
  _registerHandler: null
};

// Single global message listener from extension/content script
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data?.type) return;

  const { type, ...data } = event.data;

  if (type === "ZYNK1_LOGIN_RESPONSE" &&
      typeof ZynkWebAPI._loginHandler === "function") {
    ZynkWebAPI._loginHandler(data);
  } else if (type === "ZYNK1_REGISTER_RESPONSE" &&
             typeof ZynkWebAPI._registerHandler === "function") {
    ZynkWebAPI._registerHandler(data);
  }
});

/**
 * Login widget: renders into divID and on success redirects to success_target.
 */
function gen_auth_div(divID, success_target) {
  const container = document.getElementById(divID);
  if (!container) return;

  container.innerHTML = `
    <h2>Log in</h2>
    <form id="${divID}-login-form">
      <div>
        <label for="${divID}-login-email">Email:</label>
        <input type="email" id="${divID}-login-email" name="email" required>
      </div>
      <!-- proof is NOT required and could be hidden -->
      <input type="hidden" id="${divID}-login-proof" name="proof">
      <button type="submit">Log in with Zynk</button>
    </form>
    <div id="${divID}-login-message"></div>
  `;

  const loginForm  = document.getElementById(`${divID}-login-form`);
  const messageDiv = document.getElementById(`${divID}-login-message`);
  const proofInput = document.getElementById(`${divID}-login-proof`);

  ZynkWebAPI._loginHandler = async ({ success, message, email, pub_key, proof, nonce, timestamp }) => {
  if (!success) {
    const msg = message || "Could not get proof from extension.";
    messageDiv.innerText = `Login failed: ${msg}`;
    messageDiv.style.color = "red";
    return;
  }

  proofInput.value = proof;

  try {
    const response = await fetch("http://localhost:3000/login_zk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, pub_key, proof, nonce, timestamp })
    });

    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : {}; }
    catch { result = { message: text }; }

    if (response.ok) {
      // NEW: store user from /login_zk so courses.js can see it
      if (result.user) {
        sessionStorage.setItem("loggedInUser", JSON.stringify(result.user));
      }

      messageDiv.innerText = "Login successful. Redirecting...";
      messageDiv.style.color = "green";
      setTimeout(() => { window.location.href = success_target; }, 500);
    } else {
      const msg2 = result.message || "Login failed.";
      messageDiv.innerText = `Login failed: ${msg2}`;
      messageDiv.style.color = "red";
    }
  } catch (e) {
    console.error("Login error:", e);
    messageDiv.innerText = "An error occurred during login.";
    messageDiv.style.color = "red";
  }
};

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = document.getElementById(`${divID}-login-email`).value;

  if (!email) {
    messageDiv.innerText = "Please enter your email.";
    messageDiv.style.color = "red";
    return;
  }

  messageDiv.innerText = "Requesting proof from Zynk extension...";
  messageDiv.style.color = "black";

  window.postMessage({ type: "ZYNK1_LOGIN", email }, "*");
});
}

function gen_simplified_register_div(divID) {
  const container = document.getElementById(divID);
  if (!container) return;
  container.innerHTML = `

    <h2>Create account</h2>
    <form id="${divID}-register-form">
      <div>
        <label for="${divID}-register-name">Name:</label>
        <input type="text" id="${divID}-register-name" name="name" required>
      </div>
      <div>
        <label for="${divID}-register-email">Email:</label>
        <input type="email" id="${divID}-register-email" name="email" required>
      </div>
      <div>
        <label for="${divID}-register-role">I am a:</label>
        <select id="${divID}-register-role" name="role" required>
          <option value="">Select role…</option>
          <option value="student">Student</option>
          <option value="claim_advisor">Claim Advisor Account</option>
        </select>
      </div>
      <div id="${divID}-advisor-extra" style="display:none; font-size:13px; color:#6b7280; margin-top:4px;">
        To register as an advisor, you will need a faculty code.
      </div>
      <div>
        <label for="${divID}-register-code">Faculty code (for advisors):</label>
        <input type="text" id="${divID}-register-code" name="code" placeholder="Leave blank if student">
      </div>


      <button type="submit">Register with Zynk</button>


    </form>


    <div id="${divID}-register-message"></div>


  `;





  const registerForm = document.getElementById(`${divID}-register-form`);
  const messageDiv   = document.getElementById(`${divID}-register-message`);
  const roleSelect   = document.getElementById(`${divID}-register-role`);
  const advisorExtra = document.getElementById(`${divID}-advisor-extra`);
  const codeInput = document.getElementById(`${divID}-register-code`);
  const nameInput = document.getElementById(`${divID}-register-name`);

  roleSelect.addEventListener("change", () => {
    advisorExtra.style.display = roleSelect.value === "advisor" ? "block" : "none";
    if(roleSelect.value === "claim_advisor"){
      codeInput.style.display = "none";
      nameInput.style.display = "none";
    }
    else{
      codeInput.style.display = "block";
      nameInput.style.display = "block";
    }
  });

  ZynkWebAPI._registerHandler = async ({ success, message, email, pub_key, proof, alreadyExists, timestamp }) => {
    if (!success) {
      const msg = message || "Could not get proof from extension.";
      messageDiv.innerText = `Registration failed: ${msg}`;
      messageDiv.style.color = "red";
      return;
    }

    const name = nameInput.value;
    const role = roleSelect.value;
    const code = codeInput.value;

    if(role === "claim_advisor"){
        try {
            const response = await fetch("http://localhost:3000/claim_advisor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email, pub_key, proof, timestamp })
            });

            const text = await response.text();
            let result;
            try { result = text ? JSON.parse(text) : {}; }
            catch { result = { message: text }; }

            if (response.ok) {
                sessionStorage.setItem("loggedInUser", JSON.stringify(result.user));
                messageDiv.innerText = "Advisor account claimed. Redirecting to portal...";
                messageDiv.style.color = "green";
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
            } else {
                const msg2 = result.message || "Claim failed.";
                messageDiv.innerText = `Claim failed: ${msg2}`;
                messageDiv.style.color = "red";
            }
        } catch (e) {
            console.error("Claim error:", e);
            messageDiv.innerText = "An error occurred during claim.";
            messageDiv.style.color = "red";
        }
        return;
    }

    try {
      const response = await fetch("http://localhost:3000/register_zk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, role, code, pub_key, proof, timestamp })
      });

      const text = await response.text();
      let result;
      try { result = text ? JSON.parse(text) : {}; }
      catch { result = { message: text }; }

      if (response.ok) {
        messageDiv.innerText = alreadyExists
          ? "User already registered. You can log in."
          : "Registration successful!";
        messageDiv.style.color = "green";
      } else {
        const msg2 = result.message || "Registration failed.";
        messageDiv.innerText = `Registration failed: ${msg2}`;
        messageDiv.style.color = "red";
      }
    } catch (e) {
      console.error("Register error:", e);
      messageDiv.innerText = "An error occurred during registration.";
      messageDiv.style.color = "red";
    }
  };

  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = document.getElementById(`${divID}-register-email`).value;
    if (!email) {
      messageDiv.innerText = "Please enter your email.";
      messageDiv.style.color = "red";
      return;
    }
    messageDiv.innerText = "Requesting registration with Zynk extension...";
    messageDiv.style.color = "black";
    window.postMessage({ type: "ZYNK1_REGISTER", email }, "*");
  });
}

