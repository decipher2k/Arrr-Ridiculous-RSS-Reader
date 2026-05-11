// Shared starfield animation
(function() {
  const canvas = document.getElementById('stars-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let stars = [];
  let w, h;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    stars = [];
    for (let i = 0; i < 150; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.5 + 0.3,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        o: Math.random() * 0.7 + 0.3,
        t: Math.random() * 100
      });
    }
  }

  resize();
  window.addEventListener('resize', resize);

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      s.t += 0.01;
      const flicker = 0.5 + 0.5 * Math.sin(s.t * 3);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      const isTurquoise = Math.random() > 0.85;
      ctx.fillStyle = 'rgba(' + (isTurquoise ? '0,212,255' : '255,255,255') + ',' + (s.o * flicker) + ')';
      ctx.fill();
      s.x += s.vx;
      s.y += s.vy;
      if (s.x < 0) s.x = w;
      if (s.x > w) s.x = 0;
      if (s.y < 0) s.y = h;
      if (s.y > h) s.y = 0;
    }
    requestAnimationFrame(draw);
  }
  draw();
})();
