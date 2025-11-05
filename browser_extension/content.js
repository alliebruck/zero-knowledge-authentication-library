chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "fill_login") {
    // In a real implementation, the secret key 'x' would be securely stored in the extension.
    const x = bigInt('6');

    // Fetch public key from the server
    fetch('http://localhost:3000/public-key')
      .then(response => response.json())
      .then(publicKey => {
        const y = bigInt(publicKey.y);
        const g = bigInt(publicKey.g);
        const p = bigInt(publicKey.p);

        // 1. The client generates a random number k.
        const k = bigInt.randBetween(1, p.minus(1));

        // 2. The client calculates r = g^k mod p.
        const r = g.modPow(k, p);

        // In a real implementation, the server would generate a challenge 'e'.
        // For simplicity, we'll use a fixed challenge.
        const e = bigInt('4');

        // 3. The client calculates s = k - x*e mod (p-1).
        const s = k.minus(x.multiply(e)).mod(p.minus(1));

        document.getElementById('username').value = 'testuser';
        // The r and s fields are no longer in the HTML, so we don't need to fill them.

        // Automatically submit the form
        document.getElementById('login-form').submit();
      });
  }
});
