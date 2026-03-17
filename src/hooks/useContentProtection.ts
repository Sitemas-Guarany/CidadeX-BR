/**
 * ⚠️ DO NOT CHANGE — Proteção de conteúdo contra cópia/seleção/DevTools.
 * Exceções para input, textarea e contenteditable são INTENCIONAIS.
 * Ver .memory/security/protecao-de-conteudo.md
 */
import { useEffect } from "react";

export function useContentProtection() {
  useEffect(() => {
    // Disable right-click context menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // Disable text selection via CSS (but allow in inputs/textareas)
    const style = document.createElement("style");
    style.id = "content-protection-style";
    style.textContent = `
      body *:not(input):not(textarea):not([contenteditable="true"]) {
        -webkit-user-select: none !important;
        user-select: none !important;
      }
      input, textarea, [contenteditable="true"] {
        -webkit-user-select: text !important;
        user-select: text !important;
      }
    `;
    document.head.appendChild(style);

    // Disable copy, cut, paste — but allow inside inputs/textareas
    const handleCopy = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(target.tagName) || target.getAttribute("contenteditable") === "true") {
        return; // allow in form fields
      }
      e.preventDefault();
      return false;
    };

    // Disable drag
    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
      return false;
    };

    // Block DevTools shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12
      if (e.key === "F12") {
        e.preventDefault();
        return false;
      }
      // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C (DevTools)
      if (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase())) {
        e.preventDefault();
        return false;
      }
      // Ctrl+U (View Source)
      if (e.ctrlKey && e.key.toUpperCase() === "U") {
        e.preventDefault();
        return false;
      }
      // Ctrl+S (Save page)
      if (e.ctrlKey && e.key.toUpperCase() === "S") {
        e.preventDefault();
        return false;
      }
      // Ctrl+A (Select All) - only outside inputs/textareas
      if (e.ctrlKey && e.key.toUpperCase() === "A") {
        const target = e.target as HTMLElement;
        if (!["INPUT", "TEXTAREA"].includes(target.tagName)) {
          e.preventDefault();
          return false;
        }
      }
      // Ctrl+C outside inputs/textareas
      if (e.ctrlKey && e.key.toUpperCase() === "C") {
        const target = e.target as HTMLElement;
        if (!["INPUT", "TEXTAREA"].includes(target.tagName)) {
          e.preventDefault();
          return false;
        }
      }
    };

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCopy);
    document.addEventListener("dragstart", handleDragStart);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      const styleEl = document.getElementById("content-protection-style");
      if (styleEl) styleEl.remove();
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCopy);
      document.removeEventListener("dragstart", handleDragStart);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
