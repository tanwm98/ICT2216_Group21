async function displayUsers() {
    try {
        const response = await fetch('http://localhost:3000/displayUsers'); // Fetch data from Express API
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }

        const users = await response.json();  // Parse the JSON response

        const userList = document.getElementById('user-list');
        userList.innerHTML = ''; // Clear any existing content
        console.log(userList);

        // Loop through the users and create a list item for each user
        users.forEach(user => {
            const li = document.createElement('li');
            li.textContent = `ID: ${user.id}, Name: ${user.name}, Email: ${user.email}, Role: ${user.role}`; 
            userList.appendChild(li);  // Append each user as a list item
        });
    } catch (error) {
        console.error('Error:', error);
    }
}

// Call the function to display users when the page loads
window.onload = displayUsers;
