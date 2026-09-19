import { useEffect, useRef } from "react";
import { PwaInstallHint } from "./components/PwaInstallHint";
import { isStandaloneDisplayMode } from "./utils/pwa-install";
import "./styles/pwa-standalone.css";

interface AppShellProps {
  children: React.ReactNode;
}

/** Shell visual legado (clases `tenant-*` conservadas para paridad 1:1). */
export function AppShell({ children }: AppShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const bgLayerRef = useRef<HTMLDivElement | null>(null);

  // Parallax del fondo. Escribe el transform en el nodo directamente: antes
  // cada evento de scroll pasaba por `setState`, re-renderizaba el shell y un
  // segundo efecto aplicaba el mismo transform. Un rAF colapsa las rafagas de
  // scroll en una sola pintura por frame.
  useEffect(() => {
    const shell = shellRef.current;
    const layer = bgLayerRef.current;
    if (!shell || !layer) return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const y = shell.scrollTop || window.scrollY;
      layer.style.transform = `translateY(${-y * 0.1}px)`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    shell.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      shell.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      if (isStandaloneDisplayMode()) root.classList.add("pwa-standalone");
      else root.classList.remove("pwa-standalone");
    };
    apply();
    window.addEventListener("visibilitychange", apply);
    window.addEventListener("pageshow", apply);
    window.addEventListener("focus", apply);

    const standaloneMq = window.matchMedia("(display-mode: standalone)");
    const onMqChange = () => apply();
    standaloneMq.addEventListener?.("change", onMqChange);

    return () => {
      window.removeEventListener("visibilitychange", apply);
      window.removeEventListener("pageshow", apply);
      window.removeEventListener("focus", apply);
      standaloneMq.removeEventListener?.("change", onMqChange);
    };
  }, []);

  return (
    <div ref={shellRef} className="tenant-shell-root">
      <div ref={bgLayerRef} className="app-bg-layer tenant-shell-bg-layer" />
      <div id="app-content-layer" className="app-wrapper tenant-content-layer">
        {children}
      </div>
      <div id="app-ui-layer" className="tenant-ui-layer">
        <div id="modal-root" className="tenant-portal-modal" />
        <PwaInstallHint />
      </div>
    </div>
  );
}
