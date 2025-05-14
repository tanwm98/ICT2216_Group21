// Dynamically load shared HTML components
window.addEventListener('DOMContentLoaded', () => {
    const includes = {
      header: '/common/header.html',
      footer: '/common/footer.html',
      head: '/common/head.html'
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
  });
  