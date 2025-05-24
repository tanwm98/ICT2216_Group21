window.addEventListener('DOMContentLoaded', () => {
  fetchUser();
});


function fetchUser() {
   fetch('/api/user/getUser')
    .then(res => res.json())
    .then(data => {
      document.getElementById('profileName').textContent = data.name;
      document.getElementById('profileEmail').textContent = data.email;
      document.getElementById('userName').textContent = data.name;
    })
    .catch(err => {
      console.error('Error loading user profile:', err);
    });
}
