import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Fix for browser extensions (Google Translate, Grammarly, etc.) that modify
// the DOM and cause "removeChild"/"insertBefore" errors in React.
// See: https://github.com/facebook/react/issues/17256
if (typeof Node.prototype.removeChild === 'function') {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      console.warn('[DOM Fix] removeChild: node is not a child, skipping', child);
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };
}

if (typeof Node.prototype.insertBefore === 'function') {
  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      console.warn('[DOM Fix] insertBefore: reference node is not a child, appending instead', referenceNode);
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}

const rootEl = document.getElementById("root")!;

try {
  createRoot(rootEl).render(<App />);
} catch (err) {
  console.error("[CidadeX] Fatal render error:", err);
  rootEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f172a;color:#e2e8f0;font-family:system-ui;padding:24px;">
      <div style="text-align:center;max-width:320px;">
        <p style="font-size:18px;font-weight:700;margin-bottom:8px;">Erro ao carregar o app</p>
        <p style="font-size:13px;opacity:0.7;margin-bottom:16px;">Tente limpar o cache e recarregar.</p>
        <button onclick="caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k)))).then(()=>location.reload())" style="padding:10px 20px;background:#3b82f6;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;">
          Limpar Cache e Recarregar
        </button>
      </div>
    </div>
  `;
}
