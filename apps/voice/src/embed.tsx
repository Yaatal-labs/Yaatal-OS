import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Call } from "./call.tsx";
import { installAudioTaps } from "./visualizer.ts";
import css from "./styles.css?inline";

/**
 * Opens the call inside `host`, for the landing page's call sheet. The call lives in a shadow root,
 * so its styles and the page's never mix. `firstMessage` starts the conversation with an idea the
 * visitor picked on the page. Returns a function that closes the call.
 */
export function open(host: HTMLElement, options: { onClose?: () => void; firstMessage?: string } = {}): () => void {
  installAudioTaps();
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  const mount = document.createElement("div");
  shadow.replaceChildren(style, mount);
  const root = createRoot(mount);
  root.render(<StrictMode><Call embedded onClose={options.onClose} firstMessage={options.firstMessage} /></StrictMode>);
  return () => root.unmount();
}
