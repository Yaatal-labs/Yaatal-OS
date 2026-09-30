# Yaatal OS UI Contract

Status: visual direction approved on 2026-09-03

## Reference states

| Workspace | Light | Dark |
|---|---|---|
| SELL | [`yaatal-os-sell-light.png`](./yaatal-os-sell-light.png) | [`yaatal-os-sell-dark.png`](./yaatal-os-sell-dark.png) |
| SHOP | [`yaatal-os-shop-light.png`](./yaatal-os-shop-light.png) | [`yaatal-os-shop-dark.png`](./yaatal-os-shop-dark.png) |

These images are layout and aesthetic references, not pixel-perfect screenshots
of the current implementation. Product truth, provider availability, permissions,
and payment state continue to come from Yaatal Engine.

## Product structure

- One Tauri window and one persistent Yaatal OS shell.
- SELL and SHOP are primary workspaces in that shell, never separate apps or
  separate native windows.
- The shell owns identity, navigation, connectivity, language and theme.
- SELL contains the Live Studio and merchant operations views.
- SHOP contains BOBO discovery, product detail and Commerce Sheet views.
- Studio and BOBO use an embedded mode that suppresses their duplicate headers,
  sidebars, account controls, language selectors and theme toggles.

## Theme contract

The shell applies `data-theme="light"` or `data-theme="dark"` at the document
root and forwards the selected theme to embedded surfaces through the bounded OS
protocol. Theme preference is non-sensitive local state. Embedded surfaces may
consume the theme but may not own or persist a competing desktop theme.

Initial implementation tokens:

| Token | Light | Dark |
|---|---|---|
| Canvas | `#F4F0E6` | `#101412` |
| Surface | `#FBF8F0` | `#171C18` |
| Raised surface | `#FFFFFF` | `#20261F` |
| Primary text | `#1D211D` | `#F1E8D5` |
| Secondary text | `#686A61` | `#B9B09D` |
| Forest action | `#214D3B` | `#315E49` |
| Bronze detail | `#9A7444` | `#B68B50` |
| Live/attention | `#BC4A2E` | `#D45832` |
| Separator | `#DDD5C5` | `#514633` |

All text and interactive states must be checked against WCAG AA. Dark mode is
not an automatic inversion: product media keeps its natural color and exposure,
while canvas, surfaces, borders, text and controls use explicit dark tokens.

## Typography and density

- Use self-hosted `Source Sans 3` for controls, operational text and navigation.
- Use self-hosted `Newsreader` selectively for product names and major workspace
  headings.
- Keep the shell compact: 64 px top bar, 224 px expanded rail, 72 px collapsed
  rail, and 44 px minimum interactive targets.
- Prefer separators and spacing over stacked cards and shadows.
- No neon, glass, glow, purple gradients, floating orbs, emoji controls or
  generic AI-dashboard decoration.

## Interaction rules

1. Theme, language and account remain stable when switching SELL and SHOP.
2. A Studio product-selection event carries only a validated product ID.
3. Selecting **Open in SHOP** changes the workspace and resolves fresh product
   truth from Engine.
4. **Return to Live** restores the previous SELL context and live-session state.
5. Commerce Sheet displays familiar payment-provider choices while PI-SPI or the
   configured Engine rail remains the payment authority.
6. Microphone and live status are explicit, compact and never represented by a
   decorative glowing assistant orb.

## Acceptance views

- SELL light and dark at 1280x800 and 900x600.
- SHOP light and dark at 1280x800 and 900x600.
- Theme switch preserves the active workspace, selected product and session.
- No duplicate Studio or BOBO chrome appears in either workspace.
- Keyboard navigation, focus visibility and contrast pass in both themes.
