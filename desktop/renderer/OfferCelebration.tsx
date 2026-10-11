import { useEffect, useRef } from "react";

const DURATION = 3000;
const COLORS = ["#4285d4", "#76b4f1", "#ff725f", "#f3c963", "#f9f6f0"];

/** One bounded celebration after a saved offer. No input interception or sound. */
export default function OfferCelebration({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(frame);
      onComplete();
    };
    const timer = window.setTimeout(finish, DURATION);
    const visibility = () => { if (document.hidden) finish(); };
    const reduceMotion = () => { if (motion.matches) { canvas.hidden = true; window.cancelAnimationFrame(frame); } };
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", reduceMotion);
    const cleanup = () => {
      finished = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", reduceMotion);
    };
    if (!context || motion.matches || document.hidden) {
      canvas.hidden = true;
      return cleanup;
    }

    const width = window.innerWidth, height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.scale(ratio, ratio);
    const mascot = new Image();
    mascot.src = "./icon.png";
    const scale = Math.min(width / 950, height / 750, 1);
    const particles = Array.from({ length: 88 }, (_, index) => {
      const side = index % 2 ? 1 : -1;
      return {
        x: width * (side === 1 ? .16 : .84), y: height * .78,
        vx: side * (150 + Math.random() * 400) * scale,
        vy: -(520 + Math.random() * 380) * scale,
        angle: Math.random() * Math.PI * 2, spin: (Math.random() - .5) * 14,
        size: index % 13 === 0 ? 21 : 5 + Math.random() * 6,
        kind: index % 13 === 0 ? "zebby" : index % 3 === 0 ? "stripes" : "paper",
        color: COLORS[index % COLORS.length], phase: Math.random() * Math.PI * 2,
      };
    });
    const start = performance.now();
    let previous = start;
    const draw = (now: number) => {
      if (finished) return;
      const elapsed = now - start;
      if (elapsed >= DURATION) { finish(); return; }
      const delta = Math.min((now - previous) / 1000, .04);
      previous = now;
      context.clearRect(0, 0, width, height);
      context.globalAlpha = Math.min(1, (DURATION - elapsed) / 500);
      for (const particle of particles) {
        particle.vx *= Math.exp(-.3 * delta);
        particle.vy += 640 * scale * delta;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.angle += particle.spin * delta;
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.angle);
        const size = particle.size;
        if (particle.kind === "zebby" && mascot.complete && mascot.naturalWidth) {
          context.drawImage(mascot, -size / 2, -size / 2, size, size);
        } else {
          context.scale(1, .55 + Math.sin(elapsed / 180 + particle.phase) * .4);
          context.fillStyle = particle.kind === "stripes" ? "#fcfaf6" : particle.color;
          context.fillRect(-size / 2, -size, size, size * 2);
          if (particle.kind === "stripes") {
            context.beginPath(); context.rect(-size / 2, -size, size, size * 2); context.clip();
            context.strokeStyle = "#252222"; context.lineWidth = 2.5;
            for (let stripe = -2; stripe <= 2; stripe++) {
              context.beginPath(); context.moveTo(-size, stripe * 5);
              context.lineTo(size, stripe * 5 - 5); context.stroke();
            }
          }
        }
        context.restore();
      }
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return cleanup;
  }, [onComplete]);
  return <canvas ref={canvasRef} className="offer-confetti" aria-hidden="true" />;
}
