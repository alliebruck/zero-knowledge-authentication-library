from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature

def verify_zk_proof(pub_key_hex: str, proof_r: str, proof_s: str,
                    challenge_hex: str, timestamp_ms: int) -> bool:
    """
    Verify proof: Ed25519 signature over public key, server challenge, and timestamp.
    Compatible with @noble/curves ed25519 implementation used in the Zynk1 extension.
    """
    try:
        pub_key_bytes = bytes.fromhex(pub_key_hex)
        challenge_bytes = bytes.fromhex(challenge_hex)
        timestamp_bytes = int(timestamp_ms).to_bytes(8, byteorder='big', signed=False)
        message = pub_key_bytes + challenge_bytes + timestamp_bytes
        signature_bytes = bytes.fromhex(proof_r + proof_s)
        public_key = Ed25519PublicKey.from_public_bytes(pub_key_bytes)
        public_key.verify(signature_bytes, message)
        return True
    except (InvalidSignature, ValueError, OverflowError, Exception):
        return False
