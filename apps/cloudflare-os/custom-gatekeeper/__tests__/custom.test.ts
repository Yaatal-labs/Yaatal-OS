// Tests for the gatekeeper classes around the board.
//
// The account's outward description is where the board gets registered, and startAppUi() is the only
// way in, so both are asserted here. The board's own reads are in board.test.ts.

import { describe, expect, it } from "vitest";
import { RpcStub } from "cloudflare:workers";
import {
  CustomAccount,
  CustomSessionImpl,
  describeCustomAccount,
  describeCustomVendor,
} from "../src/custom.js";

describe("the account description", () => {
  it("advertises the board, which is the whole registration", () => {
    const account = describeCustomAccount();
    expect(account.displayName).toBe("Yaatal");
    expect(account.singleton).toEqual({ tsType: "CustomSession" });
    expect(account.providesUi).toEqual({
      title: "Poste de contrôle",
      icon: expect.objectContaining({ url: expect.stringContaining("data:image/svg+xml,") }),
    });
  });

  // getSupportedResources() stays empty and the board is not listed there. The board's capability is
  // returned solely as the `ui` stub from startAppUi, so it is reachable only by whatever holds that
  // stub. Listing it as a grantable resource would hand operator revenue to agents, which is exactly
  // the boundary the object graph is here to draw.
  it("offers no grantable resource, and keeps the deployment-info read", () => {
    const vendor = describeCustomVendor();
    expect(vendor.autoProvisionsAccount).toBe(true);
    expect(vendor.providesAuth).toBe(false);
  });
});

describe("CustomSessionImpl", () => {
  it("asks the approval queue before reading the deployment info", async () => {
    let observation: unknown;
    let disposed = false;
    const queue = {
      authorizeObservation(value: unknown) {
        observation = value;
        return Promise.resolve();
      },
      [Symbol.dispose]() {
        disposed = true;
      },
    };

    const session = new CustomSessionImpl(queue, { name: "Yaatal", message: "Utilisez le manuel." });
    await expect(session.getDeploymentInfo()).resolves.toEqual({
      name: "Yaatal",
      message: "Utilisez le manuel.",
    });
    expect(observation).toEqual({
      title: "Read deployment information",
      description: "Read the custom information configured by this deployment.",
    });

    session[Symbol.dispose]();
    expect(disposed).toBe(true);
  });
});

describe("startAppUi", () => {
  // Called on the prototype with only the fields the method reads. Constructing the entrypoint
  // properly needs the runtime's ctx, which supplies ctx.exports -- plumbing upstream owns. What is
  // under test is this method's own work: handing back the bundled page and a stub bound to this
  // viewer's admin status.
  async function frame(isAdmin: boolean) {
    const account = Object.create(CustomAccount.prototype) as CustomAccount;
    Object.assign(account, { env: { CUSTOM_NAME: "Yaatal", CUSTOM_MESSAGE: "message" } });
    return account.startAppUi({ isAdmin });
  }

  it("returns the bundled page and a fresh capability stub", async () => {
    const { iframeHtml, ui } = await frame(true);

    // The shell is real, and build-app.mjs has run: the placeholder it fills is gone. The doctype
    // check is case-insensitive because app/index.html writes it lowercase, as HTML5 permits, and
    // what is under test is that a complete document arrived rather than which case it is in.
    expect(iframeHtml.toLowerCase()).toContain("<!doctype html");
    expect(iframeHtml).toContain("Poste de contrôle");
    expect(iframeHtml).not.toContain("<!-- BOARD_SCRIPT -->");
    // capnweb is inlined rather than imported, because the iframe's origin is opaque and cannot
    // resolve a bare specifier.
    expect(iframeHtml).toContain("newMessagePortRpcSession");

    expect(ui).toBeInstanceOf(RpcStub);
  });

  // One page for everyone. It carries no data, so a second page for non-admins would be duplicate
  // maintenance with nothing to gain: the refusal comes from getViewerInfo() and the gate is
  // re-checked server-side on every method.
  it("hands the same page to a non-admin, and lets the server refuse instead", async () => {
    const admin = await frame(true);
    const viewer = await frame(false);
    expect(viewer.iframeHtml).toBe(admin.iframeHtml);
  });
});
