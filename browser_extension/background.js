chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "login_credentials") {
    console.log("Login credentials:", request.credentials);
  }
});
