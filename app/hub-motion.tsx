'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function useHubMotion(
  scope: RefObject<HTMLDivElement | null>,
  paused: boolean,
  ready: boolean,
) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(preference.matches);
    sync();
    preference.addEventListener('change', sync);
    return () => preference.removeEventListener('change', sync);
  }, []);

  const enabled = ready && !paused && !reduced;
  useEffect(() => {
    const root = scope.current;
    if (!root || !enabled) return;
    let frame = 0;
    let pointer: PointerEvent | null = null;
    let scrollDirty = true;
    const surfaces = new Set<HTMLElement>();
    const buttons = new Set<HTMLElement>();

    const update = () => {
      frame = 0;
      if (scrollDirty) {
        const range = document.documentElement.scrollHeight - window.innerHeight;
        root.style.setProperty('--page-progress', String(range > 0 ? clamp(window.scrollY / range, 0, 1) : 0));
        const hero = root.querySelector<HTMLElement>('.experience-hero');
        if (hero) {
          const bounds = hero.getBoundingClientRect();
          hero.style.setProperty('--parallax-y', `${clamp(-bounds.top * .11, -35, 55)}px`);
        }
        scrollDirty = false;
      }
      if (!pointer) return;
      const target = pointer.target instanceof Element ? pointer.target : null;
      const surface = target?.closest<HTMLElement>('.event-card, .experience-hero');
      if (surface && root.contains(surface)) {
        const bounds = surface.getBoundingClientRect();
        const x = clamp((pointer.clientX - bounds.left) / bounds.width, 0, 1);
        const y = clamp((pointer.clientY - bounds.top) / bounds.height, 0, 1);
        surface.style.setProperty('--pointer-x', `${x * 100}%`);
        surface.style.setProperty('--pointer-y', `${y * 100}%`);
        surface.style.setProperty('--tilt-x', `${(0.5 - y) * 7}deg`);
        surface.style.setProperty('--tilt-y', `${(x - 0.5) * 7}deg`);
        if (surface.classList.contains('experience-hero')) {
          surface.style.setProperty('--art-x', `${(x - 0.5) * 28}px`);
          surface.style.setProperty('--art-y', `${(y - 0.5) * 20}px`);
        }
        surfaces.add(surface);
      }
      const button = target?.closest<HTMLElement>('[data-magnetic]');
      if (button && root.contains(button)) {
        const bounds = button.getBoundingClientRect();
        button.style.setProperty('--magnet-x', `${clamp((pointer.clientX - bounds.left - bounds.width / 2) * .12, -8, 8)}px`);
        button.style.setProperty('--magnet-y', `${clamp((pointer.clientY - bounds.top - bounds.height / 2) * .12, -5, 5)}px`);
        buttons.add(button);
      }
      pointer = null;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || !window.matchMedia('(hover: hover)').matches) return;
      pointer = event;
      schedule();
    };
    const onScroll = () => { scrollDirty = true; schedule(); };
    const resetSurface = (node: HTMLElement) => {
      ['--tilt-x', '--tilt-y', '--art-x', '--art-y'].forEach(key => node.style.removeProperty(key));
    };
    const resetButton = (node: HTMLElement) => {
      ['--magnet-x', '--magnet-y'].forEach(key => node.style.removeProperty(key));
    };
    const onOut = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const related = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      const surface = target?.closest<HTMLElement>('.event-card, .experience-hero');
      if (surface && (!related || !surface.contains(related))) resetSurface(surface);
      const button = target?.closest<HTMLElement>('[data-magnetic]');
      if (button && (!related || !button.contains(related))) resetButton(button);
      pointer = null;
    };

    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerout', onOut, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerout', onOut);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      surfaces.forEach(resetSurface);
      buttons.forEach(resetButton);
      root.querySelector<HTMLElement>('.experience-hero')?.style.removeProperty('--parallax-y');
    };
  }, [scope, enabled]);
  return enabled;
}

/** Lightweight abstract light trails; no images or event information are drawn here. */
export function HeroEnergy({ running }: { running: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const surface = canvas.parentElement;
    if (!surface) return;
    let width = 0, height = 0, frame = 0, elapsed = 0, lastFrame = 0;
    let inView = true;
    const resize = () => {
      const bounds = surface.getBoundingClientRect();
      width = bounds.width; height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw(elapsed);
    };
    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      if (!width || !height) return;
      const count = width < 760 ? 20 : 36;
      const offset = Math.sin(time * .13) * 12;
      for (let index = 0; index < count; index++) {
        const seed = index * 137.508;
        const x = ((seed * 8.7 + time * (11 + index % 6)) % (width + 80)) - 40;
        const y = height * (.08 + ((index * .618) % .84)) + Math.sin(time * .45 + index) * 15 + offset;
        const intensity = .2 + ((Math.sin(index + time * .4) + 1) / 2) * .32;
        const color = index % 8 === 0 ? '214,255,115' : index % 11 === 0 ? '197,184,255' : '255,151,55';
        context.strokeStyle = `rgba(${color},${intensity})`;
        context.lineWidth = index % 3 === 0 ? 1.5 : .7;
        context.beginPath();
        context.moveTo(x - (index % 4 === 0 ? 32 : 10), y + 5);
        context.lineTo(x, y);
        context.stroke();
        context.fillStyle = `rgba(${color},${intensity + .2})`;
        context.beginPath();
        context.arc(x, y, index % 5 === 0 ? 2 : 1, 0, Math.PI * 2);
        context.fill();
      }
      context.strokeStyle = 'rgba(255,151,55,.1)';
      context.lineWidth = 1;
      for (let index = 0; index < 3; index++) {
        const x = width * .8 + Math.sin(time * .16 + index * .7) * 25;
        context.beginPath();
        context.ellipse(x, height * .48, width * (.2 + index * .06), height * (.27 + index * .08), -.45, .4, 2.1);
        context.stroke();
      }
    };
    const tick = (now: number) => {
      frame = 0;
      if (!running || !inView || document.hidden) return;
      if (now - lastFrame >= 33) {
        elapsed += Math.min(now - (lastFrame || now), 66) / 1000;
        lastFrame = now;
        draw(elapsed);
      }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastFrame = 0;
      if (running && inView && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(entries => {
      inView = entries[0]?.isIntersecting ?? false;
      sync();
    }, { rootMargin: '30px' });
    observer.observe(surface);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(surface);
    document.addEventListener('visibilitychange', sync);
    resize();
    sync();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [running]);
  return <canvas ref={canvasRef} className="hero-energy" aria-hidden="true" />;
}
