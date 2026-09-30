# Source provenance

The POC imports source only from pinned commits. Dirty or untracked working-tree content is excluded.

| Component | Source | Pinned revision |
|---|---|---|
| BOBO Shop | `C:/Users/momo-/OneDrive/Desktop/YAATAL/BOBO-` | `607b8eb07f31ca034476924387763cf38ca34415` |
| Studio | Yaatal Engine Git ref `studio/yaatal/studio-os-closure` | `074c5278a1a9a03617389539efa44c1ed2b1f9d7` |
| Engine API contract | `Yaatal-labs/Yaatal-Engine` | `74be4bdd575d366158e2e0dab30528102040aff9` |
| Engine voice seam | `Yaatal-labs/Yaatal-Engine` | `e93100971be8f3e4ce5d67af584ee135e7e24704` |
| Qwen voice backend | `Yaatal-labs/Yaatal-Engine` | `b083b0d1de71a7cc7e7723dbd5cb6df979825015` |
| Harness main | `Yaatal-labs/Yaatal-Harness` | `9a3ed3b3f65d2ba3b307b859d569265afef3496e` |
| Harness edge-turn lane | `Yaatal-labs/Yaatal-Harness` | `dfc80e176f777c3322c680b401339e8ca36fd7a2` |
| TypeScript SDK | `C:/Users/momo-/OneDrive/Desktop/YAATAL/Yaatal-SDK` | `5f69c276a715ffda065c000ce82915eafe2a6c90` |

Engine, Harness, and the voice service remain independently deployed services. Their revisions are
recorded here as acceptance-environment dependencies, not vendored runtime components.

