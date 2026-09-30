# Yaatal Live Scenes

Scene **blueprint** for livestream selling.

> ⚠️ `yaatal_live_studio.json` is a simplified blueprint, NOT an OBS
> scene-collection export — OBS's "Scene Collection → Import" will not
> accept it. Recreate the scenes/sources below by hand in OBS (or via
> `obs_controller`, which creates product scenes programmatically).
> Producing a real importable scene collection is a roadmap item.
>
> Note: the overlay browser sources must point at *served* HTML
> (e.g. `python -m http.server 8000` from `live/overlays/`), not at
> raw.githubusercontent.com URLs — GitHub serves those as plain text,
> which OBS's browser source will not render as a page.

## After setup

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

The `obs_controller` creates additional per-product scenes dynamically
during a session (e.g. `Product_001`, `Product_002`). These are created
and removed by the MCP server — you don't need to pre-build them.