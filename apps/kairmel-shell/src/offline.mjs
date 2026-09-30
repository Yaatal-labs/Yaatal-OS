// Pure logic for the local "Kairmel est injoignable" page. No Tauri API is
// used anywhere here - the offline page is plain, ordinary web content, on
// purpose (see the "main" capability, which grants it nothing either).

/**
 * Best-effort reachability probe for `url`, using a plain `fetch`. A
 * cross-origin `no-cors` request either resolves (server responded with
 * *something*, even an opaque response) or rejects/aborts (DNS failure,
 * connection refused, timeout) - that's all the offline page needs to
 * decide whether it's worth trying to navigate back to Kairmel.
 *
 * @param {string} url
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number}} [options]
 * @returns {Promise<boolean>}
 */
export async function probeReachable(url, options = {}) {
  const { fetchImpl = fetch, timeoutMs = 4000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetchImpl(url, {
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wire a "Réessayer" button: on click, probe the Kairmel origin and, if
 * reachable, navigate there; otherwise leave the user on this page.
 *
 * @param {{
 *   button: { addEventListener: Function, disabled: boolean, textContent: string },
 *   kairmelUrl: string,
 *   navigate: (url: string) => void,
 *   probe?: typeof probeReachable,
 * }} deps
 */
export function wireRetryButton({ button, kairmelUrl, navigate, probe = probeReachable }) {
  const idleLabel = button.textContent;
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Nouvelle tentative…";
    const reachable = await probe(kairmelUrl);
    if (reachable) {
      navigate(kairmelUrl);
      return;
    }
    button.disabled = false;
    button.textContent = idleLabel;
  });
}
