declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("./index.js");
    durableNamespaces: "CustomGatekeeper";
  }

  // The board's three secrets. All optional, and all absent in local dev, so every read path checks
  // for its own before using it and refuses with a message naming the missing name.
  //
  // Set with `wrangler secret put <NAME>` on this worker, never in wrangler.jsonc. scripts/deploy.ts:579
  // assigns `customGatekeeper.vars` wholesale from deployment.jsonc, so a var declared in this
  // package's wrangler.jsonc would be discarded at deploy: present in local dev, silently absent in
  // production. A secret is not swept up by that assignment, which is why these live here.
  //
  // Merges into the Env that `wrangler types` generates, which supplies CUSTOM_NAME and CUSTOM_MESSAGE.
  interface Env {
    /**
     * Bearer token for api.kairmel.com's GET /admin/usage. This is the token gateway's own
     * ADMIN_TOKEN, which already exists; the board is a second reader of the same report the
     * gateway bills from, so the figures can never disagree with what was charged.
     */
    TOKEN_GATEWAY_ADMIN_TOKEN?: string;
    /**
     * A PostHog personal key (phx_…, scope query:read) for the board's own HogQL queries.
     *
     * Not the key the Engine ingests with. A project key (phc_…) can only write events; a personal
     * key can only read them. Neither substitutes for the other.
     */
    POSTHOG_PERSONAL_API_KEY?: string;
    /** The numeric PostHog project id the queries run against. */
    POSTHOG_PROJECT_ID?: string;
  }
}
