document.getElementById('login-form').addEventListener('submit', async function(event) {
  event.preventDefault();

  const username = document.getElementById('username').value;

  // In a real implementation, the secret key 'x' would be securely stored on the client.
  const x = bigInt('6');

  // Fetch public key from the server
  const publicKeyResponse = await fetch('http://localhost:3000/public-key');
  const publicKey = await publicKeyResponse.json();
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

  // Populate the input fields
  document.getElementById('y').value = y.toString();
  document.getElementById('r').value = r.toString();
  document.getElementById('e').value = e.toString();
  document.getElementById('s').value = s.toString();

  const response = await fetch('http://localhost:3000/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, r: r.toString(), s: s.toString() })
  });

  const data = await response.json();

  if (data.success) {
    window.location.href = 'advising.html';
  } else {
    alert(data.message);
  }
});
