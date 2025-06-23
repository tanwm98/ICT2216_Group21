(function() {
    'use strict';
    const hostname = window.location.hostname;
    const isProduction = hostname !== 'localhost' && hostname !== '127.0.0.1';
    
    if (isProduction) {
        console.log = function() {};
        console.info = function() {};
        console.debug = function() {};
        console.warn = function() {};
        console.error = function() {};
    }
})();

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

      const loadIncludes = Object.entries(includes).map(([key, path]) => {
        const el = document.getElementById(`${key}-placeholder`);
        if (el) {
          return fetch(path)
            .then(res => res.text())
            .then(html => {
              el.innerHTML = html;
            })
            .catch(err => {
              console.error(`Error loading ${key}:`, err);
            });
        }
      });

      // After all includes loaded
      Promise.all(loadIncludes).then(() => {
        // Check for URL hash or trigger condition
        const url = new URL(window.location.href);
        if (url.searchParams.get('reset') === '1') {
          const modalEl = document.getElementById('resetPasswordModal');
          if (modalEl) {
            const resetModal = new bootstrap.Modal(modalEl);
            resetModal.show();
          }
        }
      });
    })
    .catch(err => {
      console.error('Error checking session:', err);
    });
});
