# Yaatal Live Scenes

Pre-built OBS scene collection for livestream selling.

## Import

1. Open OBS Studio
2. Menu → Scene Collection → Import
3. Select `yaatal_live_studio.json`
4. Switch to the "Yaatal Live Selling Studio" scene collection

## After import

| Source | What to configure |
|---|---|
| Camera | Right-click → Properties → select your webcam/capture device |
| Store_Logo | Right-click → Properties → set path to your store logo image |
| WhatsApp_Contact | Right-click → Properties → update with your WhatsApp number |
| Price/CTA/Product overlays | No config needed — controlled by MCP server |

## Scenes

| Scene | When to use |
|---|---|
| Welcome | Start of stream — store logo + "Bienvenue / Dalal jamm" |
| Product_Showcase | During selling — camera + price + product info + CTA + comments + sold-out stamp |
| Outro | End of stream — "Merci" + WhatsApp contact |

The `obs-controller` creates additional per-product scenes dynamically
during a session (e.g. `Product_001`, `Product_002`). These are created
and removed by the MCP server — you don't need to pre-build them.