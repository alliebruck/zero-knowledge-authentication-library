document.addEventListener('DOMContentLoaded', () => {
    const accountList = document.getElementById('accountList');

    // Get all users from the background script and display them
    chrome.runtime.sendMessage({ action: "getAllUsers" }, (response) => {
        if (response.success && response.users) {
            const users = response.users;
            const emails = Object.keys(users);

            accountList.innerHTML = ''; // Clear the "Loading..." text

            if (emails.length === 0) {
                accountList.innerHTML = '<li>No accounts registered yet.</li>';
            } else {
                emails.forEach(email => {
                    const li = document.createElement('li');
                    li.textContent = email;
                    accountList.appendChild(li);
                });
            }
        } else {
            accountList.innerHTML = '<li>Error loading accounts.</li>';
        }
    });
});