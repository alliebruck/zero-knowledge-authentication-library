const express = require('express');
const bigInt = require('big-integer');

const app = express();
const port = 3000;

// Schnorr Protocol parameters
const p = bigInt('23'); // A prime number
const g = bigInt('5');  // A generator

// Secret key (replace with a secure way to store and retrieve this)
const x = bigInt('6');

// Public key
const y = g.modPow(x, p);

app.use(express.json());

// Endpoint to get the public key
app.get('/public-key', (req, res) => {
  res.json({ y: y.toString(), g: g.toString(), p: p.toString() });
});

// Endpoint to perform the ZK-proof login
app.post('/login', (req, res) => {
  const { username, r, s } = req.body;

  // 1. The server receives r from the client.
  // In a real implementation, the server would generate a challenge 'e'.
  // For simplicity, we'll use a fixed challenge.
  const e = bigInt('4');

  // 2. The server calculates g^s * y^e mod p
  const leftSide = g.modPow(s, p).multiply(y.modPow(e, p)).mod(p);

  // 3. The server compares the result with r.
  if (leftSide.equals(r)) {
    res.json({ success: true, message: 'Login successful!' });
  } else {
    res.json({ success: false, message: 'Login failed!' });
  }
});

app.listen(port, () => {
  console.log(`Core API listening at http://localhost:${port}`);
});
