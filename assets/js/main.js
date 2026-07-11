var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
if (isMobile) document.body.classList.add('mobile');
Reveal.initialize({
  width: isMobile ? 420 : 1200,
  height: isMobile ? 720 : 700,
  margin: isMobile ? 0.06 : 0.04,
  hash: true,
  slideNumber: true,
  transition: 'fade',
  transitionSpeed: 'default'
});
lucide.createIcons();
