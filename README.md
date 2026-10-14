# Yaatal OS

## Kairmel clients and services

The current Kairmel Windows and Android clients share the hosted web app through
[`apps/kairmel-shell`](apps/kairmel-shell/README.md). Both have 0.1.1 tester releases.
The shell supplies native navigation, Google sign-in handoff and platform integration;
the web app owns the merchant interface. Token gateway, Marché and voice services also
live in this repository.

Current integration evidence is collected in the [headless service supplement](docs/contracts/kairmel-headless-os.md)
and [native acceptance matrix](docs/contracts/kairmel-native-acceptance.md).
The [native alignment verification](docs/evidence/2026-10-13-native-alignment.md)
records the reuse checks and local validation for the current change.

The Sell/Shop desktop implementation below is the earlier proof of concept in
[`apps/desktop`](apps/desktop/README.md). Its Studio sidecar and native IPC are separate
from the hosted Kairmel shell. Its acceptance records describe that prototype.

## Earlier desktop proof of concept

Yaatal OS is the lightweight desktop shell for Yaatal's agentic social-commerce proof of concept.
It brings the seller cockpit (Studio) and buyer marketplace (BOBO Shop) into one Tauri 2 application
without moving business authority out of Yaatal Engine or policy authority out of Yaatal Harness.

## POC contract

- **Sell workspace:** Studio cockpit, voice session, governed actions, and OBS controls.
- **Shop workspace:** BOBO's Expo web surface backed by `@yaatal/client`.
- **Tauri host:** one unified native window, narrow IPC, sidecar supervision, deep links, and local secrets.
- **Remote services:** Engine owns identity and commerce; Harness owns policy and audit; the voice service owns inference.

The first product acceptance flows are:

1. a seller product-switch request approved by Harness and reflected through the OS shell; and
2. an on-air product shared through a portable social link, opened as a mobile Commerce Sheet,
   paid through an explicit sandbox provider, and recorded as a livestream-attributed conversion.

The second flow is executable behind `YAATAL_COMMERCE_POC=1`. Its in-memory adapter is deliberately
temporary: the production CommerceIntent, inventory transaction, payment, and order remain Engine
responsibilities. See [the social-commerce POC runbook](docs/SOCIAL-COMMERCE-POC.md).

## Current execution

The native shell and sandbox social checkout are validated, but the real Studio
and BOBO user surfaces are not yet integrated. Start with the
[Symphony board](docs/BOARD.md) and the
[real-surfaces execution handoff](docs/OS-REAL-SURFACES-HANDOFF.md). The approved
[SELL/SHOP light and dark UI contract](docs/design/YAATAL-OS-UI-CONTRACT.md)
defines the product target. Do not treat
a successful shell launch as finished-product acceptance.

