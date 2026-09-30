# UXR-06A: Embedded SELL social checkout

[Français](./UXR-06A-EMBEDDED-SOCIAL-CHECKOUT.fr.md)

Status: validated on 8 September 2026.

## What changed

The embedded Studio SELL surface now creates the existing feature-gated POC `CommerceIntent` for the selected canonical product. The dialog exposes only links returned by the Studio server:

- copy checkout link;
- livestream attribution link;
- WhatsApp share link;
- Telegram share link;
- direct Commerce Sheet link.

The request uses the existing HttpOnly operator session. No bearer token enters iframe state, `localStorage`, logs or share URLs. A newer product request cancels and invalidates the previous one. Insights refreshes use the same last-request-wins rule, so a late response cannot hide a newly recorded conversion.

The Commerce Sheet dialog has a viewport-bounded, scrollable layout for short screens. The media grid also includes the seventh labeled fallback asset, `cosmetics.webp`.

## Traceable checkpoint

- Feature commit: `5f01acb`.
- Race, viewport and behavior-test hardening: `26c97b9`.
- Spec review: compliant.
- Code-quality review: approved with no remaining findings.
- Focused Commerce tests: 14 passed.
- OS workspace tests: 11 passed.
- `pnpm check`: passed.
- `pnpm build`: passed.
- Tauri Rust tests: 2 passed.
- `git diff --check`: passed.

The executable Node harness forces checkout and Insights responses to arrive out of order and proves the current product and latest conversion result remain visible.

## What is not built

- One native login does not yet bootstrap authenticated Studio and BOBO sessions. That is UXR-04B.
- The final 1280×800 and 900×600 native browser acceptance run is still pending.
- The production Engine does not yet own a persisted `CommerceIntent`, transactional stock, PI-SPI payment settlement or receipt authority.
- Automatic privileged posting into Telegram, WhatsApp or livestream platforms is not part of this card. The server returns portable attributed links.
- The offline outbox is still pending.

These gaps keep UXR-06 open. UXR-06A only closes the embedded SELL launcher and its concurrency, security and layout behavior.
