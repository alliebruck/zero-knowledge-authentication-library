document.addEventListener('DOMContentLoaded', () => {
    const logoutButton = document.getElementById('logoutButton');
    const userEmailEl = document.getElementById('userEmail');

    const userRegisteredEl = document.getElementById('userRegistered');

    // Retrieve the user object from session storage
    const loggedInUserStr = sessionStorage.getItem('loggedInUser');
    
    if (!loggedInUserStr) {
        // If no user is logged in, redirect to the main page
        window.location.href = 'index.html';
        return;
    }

    try {
        const user = JSON.parse(loggedInUserStr);

        // Populate the dashboard with user data
        userEmailEl.textContent = user.email || 'N/A';

        userRegisteredEl.textContent = user.registered_at ? new Date(user.registered_at).toLocaleString() : 'N/A';

    } catch (error) {
        console.error('Failed to parse user data from session storage:', error);
        // Clear corrupted data and redirect
        sessionStorage.removeItem('loggedInUser');
        window.location.href = 'index.html';
        return;
    }

    logoutButton.addEventListener('click', () => {
        // Clear the session storage and redirect to the main page
        sessionStorage.removeItem('loggedInUser');
        window.location.href = 'index.html';
    });
});