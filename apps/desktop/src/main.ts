/** Keep both renderer dependency graphs isolated, including their styles. */
export async function startRenderer(unified: boolean, loaders = {
  unified: () => import("./unified/entry"),
  legacy: () => import("./legacy"),
}): Promise<void> {
  if (unified) await loaders.unified();
  else await loaders.legacy();
}
if (typeof document !== "undefined") void startRenderer(import.meta.env.VITE_YAATAL_UNIFIED_UI === "1");
