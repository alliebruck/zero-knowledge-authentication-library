console.log("Zynk1 Authenticator content script injected.");

// Listen for messages from the web page
window.addEventListener("message", (event) => {
    // We only accept messages from ourselves
    if (event.source !== window || !event.data.type) {
        return;
    }

    const { type, email } = event.data;

    // Handle registration request from web page
    if (type === "ZYNK1_REGISTER") {
        console.log(`Content script received register request for ${email}.`);
        if (typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined') {
            chrome.runtime.sendMessage({ action: "generateAndStoreKeysForEmail", email: email }, (response) => {
                window.postMessage({ type: "ZYNK1_REGISTER_RESPONSE", ...response }, "*");
            });
        } else {
            console.error("Chrome runtime API not available. Is this running as a content script?");
        }
    } 
    // Handle login request from web page
    else if (type === "ZYNK1_LOGIN") {
        console.log(`Content script received login request for ${email}.`);
        if (typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined') {
            chrome.runtime.sendMessage({ action: "generateProofForEmail", email: email }, (response) => {
                window.postMessage({ type: "ZYNK1_LOGIN_RESPONSE", ...response }, "*");
            });
        } else {
            console.error("Chrome runtime API not available. Is this running as a content script?");
        }
    } else if (type === "ZYNK1_CLAIM_ADVISOR") {
        console.log(`Content script received claim advisor request for ${email}.`);
        if (typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined') {
            chrome.runtime.sendMessage({ action: "generateAndStoreKeysForEmail", email: email }, (response) => {
                window.postMessage({ type: "ZYNK1_CLAIM_ADVISOR_RESPONSE", ...response }, "*");
            });
        } else {
            console.error("Chrome runtime API not available. Is this running as a content script?");
        }
    }
}, false);
