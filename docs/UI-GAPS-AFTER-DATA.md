# UI gaps — deferred until the corpus work lands

*Recorded 2026-09-03 from two screenshots of the running Windows build, against
`docs/design/YAATAL-OS-UI-CONTRACT.md` (approved 2026-09-03). Focus moved to the data
lane; this is the pickup list, not a backlog wish list — every item below was observed,
not imagined.*

## Reconciliation — 2026-09-04

This document re-entered the branch with the remote responsive-UI lineage at
`a07d128`. Its observations are historical; use this table instead of assuming
every original item remains open.

| Original item | Current status |
|---|---|
| Studio duplicate brand/navigation rail | **Closed** by `9a6f9d1`; current-source Studio embedded mode exposes only the page-level Live/Catalog/Media/Insights view strip. |
| Two SELL header rows | **Open** for the unified native UXR-06 run; the isolated embedded surface still owns Preview/Arm controls below shell chrome. |
| Mostly empty assistant column | **Open** at wide viewports; it collapses cleanly at 900×600. |
| BOBO embedded mode | **Partial** through `b63babc`; the shell passes `embedded=1` and constrains measure, but BOBO still needs first-class embedded chrome ownership. |
| Rail and authenticated pane route can disagree | **Open**, coupled to the unfinished SELL/SHOP session bootstrap in UXR-04/07. |

UXR-05 catalog/media is independently closed at `d6eb509`: current-source SELL
and packaged SHOP showed the same 20 live Engine products and labeled fallback
media at both acceptance viewports.

## Already fixed (commits `5f2d13d`, `03bf97a`)

| | |
|---|---|
| top bar overlap | `grid-template-columns: 1fr auto 1fr` with an empty spacer column that would not shrink, squeezing the account bar until its `nowrap` children overflowed across the SELL/SHOP segments |
| segments overflow | hard 316px, overflowed alone once the rail collapsed |
| coarse breakpoints | one 1080px step; between ~900 and 1200 the bar still wanted more room than it had |
| shadows | three surfaces carried them; the contract says separators and spacing |
| collapsed rail | 76px against the contract's 72px |
| no collapse control | the reference shows "Réduire"; the rail only narrowed at a breakpoint |
| dark mode ignored the OS | `readTheme()` returned `"light"` unconditionally and there was no `prefers-color-scheme` query, so a dark desktop got a light app until the user found the toggle |
| clipped utility card | `margin: 8vh auto` inside an `overflow: hidden` parent |
| Shop not told it was embedded | see below |

---

## Original open observations

**Embedded mode is the contract's central mechanism and it is only half implemented.**

> *"Studio and BOBO use an embedded mode that suppresses their duplicate headers,
> sidebars, account controls, language selectors and theme toggles."*

### 1. Studio shows a second navigation inside the shell — **not in this repo**

The SELL screenshot has a sub-navigation panel reading **YAATAL / Live · Catalog · Media ·
Insights**, nested directly under the shell's own rail (Home · Live · Products · Orders ·
Customers). Two navigations, one inside the other.

Those labels appear **nowhere in `apps/studio`**, whose nav reads *Dashboard · Live Studio
· Content Library · Product Catalog · Analytics*. So the sidecar is serving the separate
**`Yaatal-Studio` repository**, not the vendored copy in this workspace.

`apps/studio` does implement the contract:

```css
html[data-embedded="true"] .topbar,
html[data-embedded="true"] .sidebar { display: none; }
```

The live Studio evidently does not, or names that panel something other than `.sidebar`.
**Fix belongs in `Yaatal-Studio`, not here.** Worth resolving which copy is authoritative
before either is changed — a vendored copy that has drifted from the repo the sidecar
actually runs is its own problem.

### 2. Two header rows in SELL

The shell renders `Live Studio / GOVERNED SELLER WORKSPACE` with `Live | Utility |
Diagnostics`. The embedded surface then renders `Preview / Local Studio connected` with
`Open in SHOP →` and `Arm cockpit`. Two bands doing the same job, stacked.

Per the contract the shell owns workspace identity and the primary action. The embedded
surface should render neither.

### 3. The Live assistant column is mostly void

Two timeline entries, then a large empty run, then a pinned card at the bottom. Either the
column should size to its content, or the empty state should say what will appear there.
A tall empty panel reads as broken rather than as awaiting data.

### 4. BOBO does not honour `embedded=1`

Fixed from the shell side for now (`03bf97a`): the flag is passed and the shell injects a
measure constraint, because the bundle is same-origin. That stops the login form
rendering an email field over a thousand pixels wide.

It is a mitigation. **BOBO should implement embedded mode itself**, as Studio does —
suppressing its own branding block, account surface and language control, all of which the
shell already provides. Shell-side CSS injection against React Native Web output is
fragile by nature: it depends on structure BOBO is free to change.

### 5. Rail state and pane content can disagree

The SHOP screenshot shows **Products** active in the rail while the pane renders BOBO's
login. The rail claims a destination the pane is not showing. Either the rail should
reflect the embedded surface's actual route, or unauthenticated state should be handled by
the shell before the pane is mounted.

---

## Not a UI bug, but adjacent

The vendored `apps/studio` has drifted from whatever the sidecar runs. Until that is
settled, a fix applied here may not reach the running application at all — which is how
this list came to contain an item nobody could reproduce from the repository.

## Suggested order when this resumes

1. Settle which Studio is authoritative (vendored vs. `Yaatal-Studio`).
2. Implement embedded mode in BOBO; retire the shell-side CSS injection.
3. Suppress the duplicate Studio navigation and header row.
4. Rail/route agreement, and an honest empty state for the assistant column.
