// Dynamically load shared HTML components
window.addEventListener('DOMContentLoaded', () => {
  // First, check session status
  fetch('/api/session')
    .then(res => res.json())
    .then(data => {
      const includes = {
        head: '/common/head.html',
        header: data.loggedIn ? '/common/loginheader.html' : '/common/header.html',
        footer: '/common/footer.html'
      };

      for (const [key, path] of Object.entries(includes)) {
        const el = document.getElementById(`${key}-placeholder`);
        if (el) {
          fetch(path)
            .then(res => res.text())
            .then(html => {
              el.innerHTML = html;
            })
            .catch(err => {
              console.error(`Error loading ${key}:`, err);
            });
        }
      }
    })
    .catch(err => {
      console.error('Error checking session:', err);
    });
});
