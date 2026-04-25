// === NAVBAR SCROLL EFFECT ===
const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  });
}

// === HAMBURGER MENU ===
const hamburger = document.getElementById('hamburger');
const navLinks = document.querySelector('.nav-links');
if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
  });
}

// === COUNTER ANIMATION ===
function animateCounter(el, target, suffix = '') {
  let current = 0;
  const step = Math.ceil(target / 60);
  const interval = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current.toLocaleString() + suffix;
    if (current >= target) clearInterval(interval);
  }, 20);
}

const studentsEl = document.getElementById('counter-students');
const coursesEl = document.getElementById('counter-courses');
const hoursEl = document.getElementById('counter-hours');

if (studentsEl) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(studentsEl, 4200, '+');
        animateCounter(coursesEl, 12);
        animateCounter(hoursEl, 48);
        observer.disconnect();
      }
    });
  }, { threshold: 0.5 });
  observer.observe(studentsEl);
}

// === AUTH GUARD (for protected pages) ===
const protectedPages = ['/dashboard.html', '/profile.html'];
const currentPath = window.location.pathname;
if (protectedPages.some(p => currentPath.endsWith(p))) {
  const token = localStorage.getItem('token');
  if (!token) window.location.href = '/login.html';
}

// === ACTIVE NAV LINK ===
document.querySelectorAll('.nav-links a').forEach(link => {
  if (link.href === window.location.href) link.classList.add('active');
});
