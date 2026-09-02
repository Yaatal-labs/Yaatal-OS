# Yaatal OS

Yaatal OS is the lightweight desktop shell for Yaatal's agentic social-commerce proof of concept.
It brings the seller cockpit (Studio) and buyer marketplace (BOBO Shop) into one Tauri 2 application
without moving business authority out of Yaatal Engine or policy authority out of Yaatal Harness.

## POC contract

- **Sell window:** Studio cockpit, voice session, governed actions, and OBS controls.
- **Shop window:** BOBO's Expo web surface backed by `@yaatal/client`.
- **Tauri host:** window lifecycle, capability-scoped IPC, sidecar supervision, deep links, and local secrets.
- **Remote services:** Engine owns identity and commerce; Harness owns policy and audit; the voice service owns inference.

The first product acceptance flow is a seller product-switch request that is approved by Harness,
applied through Engine, and reflected in the Shop window.

