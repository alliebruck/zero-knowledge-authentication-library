const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(i => i.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    item.classList.add('active');
    document.getElementById(item.dataset.tab).classList.add('active');
  });
});

document.getElementById('logout').addEventListener('click', () => {
  window.location.href = 'index.html';
});
