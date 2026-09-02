# Yaatal OS

Yaatal OS is the lightweight desktop shell for Yaatal's agentic social-commerce proof of concept.
It brings the seller cockpit (Studio) and buyer marketplace (BOBO Shop) into one Tauri 2 application
without moving business authority out of Yaatal Engine or policy authority out of Yaatal Harness.

## POC contract

- **Sell window:** Studio cockpit, voice session, governed actions, and OBS controls.
- **Shop window:** BOBO's Expo web surface backed by `@yaatal/client`.
- **Tauri host:** window lifecycle, capability-scoped IPC, sidecar supervision, deep links, and local secrets.
- **Remote services:** Engine owns identity and commerce; Harness owns policy and audit; the voice service owns inference.

The first product acceptance flows are:

1. a seller product-switch request approved by Harness and reflected through the OS shell; and
2. an on-air product shared through a portable social link, opened as a mobile Commerce Sheet,
   paid through an explicit sandbox provider, and recorded as a livestream-attributed conversion.

The second flow is executable behind `YAATAL_COMMERCE_POC=1`. Its in-memory adapter is deliberately
temporary: the production CommerceIntent, inventory transaction, payment, and order remain Engine
responsibilities. See [the social-commerce POC runbook](docs/SOCIAL-COMMERCE-POC.md).

