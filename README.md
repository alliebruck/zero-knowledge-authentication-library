# Zero-Knowledge Authentication Library

A cryptographic authentication library demonstrating zero-knowledge proof (ZKP) authentication without transmitting or storing user secrets. This project was developed as part of a senior capstone project and explores how zero-knowledge proofs can be used to securely verify user identity while mitigating common authentication attacks.

## Overview

Traditional password authentication requires transmitting secrets or password-derived values that can become targets for attackers. This library demonstrates an alternative authentication approach where a user proves knowledge of a secret without revealing the secret itself.

The project includes proof generation, proof verification, replay attack protection, and integration into a browser extension and web application.

To demonstrate a real-world use case, the project also included an AI-powered assistant that integrated directly with the authentication library. Users authenticated through the zero-knowledge proof workflow before interacting with the assistant, showcasing how AI applications can leverage secure authentication without exposing sensitive credentials.



## Features

- Zero-knowledge proof generation and verification
- Replay attack protection using timestamp validation
- Secure challenge-response authentication workflow
- Ed25519-based cryptographic operations
- Browser extension authentication support
- REST API integration with the authentication service
- Modular authentication library suitable for integration into web applications
- AI-powered assistant demonstrating how applications can securely authenticate using the zero-knowledge authentication library



## Technologies

- Python
- Flask
- JavaScript
- HTML/CSS
- Ed25519 Cryptography
- REST APIs



## Authentication Workflow

1. User registers a public key with the server.
2. Server generates a random authentication challenge.
3. Client generates a cryptographic proof using its private key.
4. Client sends the proof and timestamp.
5. Server verifies:
   - Proof validity
   - Timestamp freshness
   - Public key ownership
6. User is authenticated without exposing their secret.



## My Contributions

This repository represents my contributions to our senior capstone project.

My primary responsibilities included:

- Designing and implementing the zero-knowledge proof authentication library
- Developing proof generation and verification logic
- Implementing replay attack protection through timestamp validation
- Integrating the authentication workflow with the web application
- Designing portions of the authentication architecture
- Testing and debugging the authentication process
- Integrated the authentication library with an AI-powered assistant to demonstrate secure authentication within a modern AI application workflow.


## Security Considerations

This project demonstrates several secure authentication principles including:

- Zero-knowledge authentication
- Replay attack mitigation
- Challenge-response authentication
- Public/private key cryptography
- Secure proof verification



## Future Improvements

Potential future enhancements include:

- Multi-factor authentication
- Hardware security key integration
- Additional cryptographic proof protocols
- Expanded testing and benchmarking
- OAuth/OpenID Connect integration



## Team Project

This project originated as a senior capstone completed by a four-person team.

This repository serves as my portfolio version and highlights the portions of the project that I personally implemented and maintained.



## License

This repository is provided for educational and portfolio purposes.
