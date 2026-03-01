// login.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('login-email');
  const msgEl = document.getElementById('login-message');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) {
      msgEl.textContent = 'Please enter your email.';
      msgEl.style.color = 'red';
      return;
    }

    msgEl.textContent = 'Requesting login from Zynk extension...';
    msgEl.style.color = 'black';

    // Whatever your webapi.js listens for:
    window.postMessage({ type: 'ZYNK1_LOGIN', email }, '*');
  });

  // handler webapi.js will call after /login_zk
  ZynkWebAPI = window.ZynkWebAPI || {};
  ZynkWebAPI._loginHandler = ({ success, message, user }) => {
    if (!success) {
      msgEl.textContent = message || 'Login failed.';
      msgEl.style.color = 'red';
      return;
    }

    // store basic info for client-side checks
    sessionStorage.setItem('loggedInUser', JSON.stringify(user));

    msgEl.textContent = 'Login successful, redirecting...';
    msgEl.style.color = 'green';
    window.location.href = 'courses.html';
  };
});
