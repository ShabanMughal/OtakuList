// OtakuList landing, scroll reveals, sticky nav state, single-open FAQ.

// Reveal on scroll (staggered via data-delay)
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        const d = e.target.dataset.delay || 0;
        setTimeout(() => e.target.classList.add("in"), d);
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// Sticky nav: add background once scrolled
const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 20);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

// FAQ: keep only one open at a time
const faqs = document.querySelectorAll(".faq details");
faqs.forEach((d) =>
  d.addEventListener("toggle", () => {
    if (d.open) faqs.forEach((o) => o !== d && (o.open = false));
  })
);
