// This script runs in the invisible prover.html page.
// Its sole purpose is to generate ZKP proofs in a stable webpage environment.

console.log("Prover page script loaded.");

// --- ZKP & Crypto Functions ---

// Converts a hex string to a BigInt.
function secretToBigInt(str) {
    return BigInt('0x' + str);
}

// Generates a ZKP proof for a given secret.
async function generateProof(secret, uid) {
    console.log("Prover script: Generating proof for UID:", uid);
    
    const secretBigInt = secretToBigInt(secret);
    
    // Generate the full proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        { secret: secretBigInt }, 
        './auth.wasm', 
        './auth_final.zkey'
    );

    console.log("Prover script: Proof generated.");
    return { proof, publicSignals };
}

// --- Message Listener ---

// Listen for requests from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { action, payload } = request;

    if (action === "generateProof") {
        console.log("Prover script: Received request to generate proof.");
        (async () => {
            try {
                const { secret } = await chrome.storage.local.get('secret');
                if (!secret) {
                    throw new Error("No secret found in extension storage.");
                }
                const result = await generateProof(secret, payload.uid);
                // Send success response
                sendResponse({ status: "success", ...result });
            } catch (error) {
                console.error("Error in prover script:", error);
                // Send error response
                sendResponse({ status: "error", message: error.message });
            }
        })();
        return true; // Indicate that sendResponse will be called asynchronously
    }
});

console.log("Prover page ready and listening for messages.");
