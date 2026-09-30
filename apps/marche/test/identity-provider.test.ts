import { describe, expect, it, vi } from "vitest";
import { DeviceIdentityProvider, NotSignedInError, SessionIdentityProvider } from "../src/host/identity-provider";
import { NotSignedInHttpError, type AuthClient } from "../src/host/auth-client";
import { deriveAppUserId } from "../src/host/identity";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("SessionIdentityProvider", () => {
  function fakeAuth(overrides: Partial<Pick<AuthClient, "getMe" | "getIdentity">> = {}) {
    return {
      getMe: overrides.getMe ?? vi.fn(async () => ({ signedIn: true })),
      getIdentity: overrides.getIdentity ?? vi.fn(async () => ({ id: "real-id" })),
    };
  }

  it("isSignedIn() reflects auth.getMe()'s signedIn flag", async () => {
    const signedIn = new SessionIdentityProvider(fakeAuth({ getMe: vi.fn(async () => ({ signedIn: true })) }));
    await expect(signedIn.isSignedIn()).resolves.toBe(true);

    const signedOut = new SessionIdentityProvider(fakeAuth({ getMe: vi.fn(async () => ({ signedIn: false })) }));
    await expect(signedOut.isSignedIn()).resolves.toBe(false);
  });

  it("getIdentity() returns auth.getIdentity()'s id", async () => {
    const auth = fakeAuth({ getIdentity: vi.fn(async (appId: string) => ({ id: `id-for-${appId}` })) });
    const provider = new SessionIdentityProvider(auth);
    await expect(provider.getIdentity("boutique-express")).resolves.toBe("id-for-boutique-express");
  });

  it("getIdentity() translates NotSignedInHttpError into the bridge-facing NotSignedInError", async () => {
    const auth = fakeAuth({
      getIdentity: vi.fn(async () => {
        throw new NotSignedInHttpError();
      }),
    });
    const provider = new SessionIdentityProvider(auth);
    await expect(provider.getIdentity("boutique-express")).rejects.toBeInstanceOf(NotSignedInError);
  });

  it("getIdentity() lets any other error through unchanged", async () => {
    const boom = new Error("network down");
    const auth = fakeAuth({
      getIdentity: vi.fn(async () => {
        throw boom;
      }),
    });
    const provider = new SessionIdentityProvider(auth);
    await expect(provider.getIdentity("boutique-express")).rejects.toBe(boom);
  });
});

describe("DeviceIdentityProvider (dev-only placeholder)", () => {
  it("isSignedIn() always resolves true -- there is no real sign-in concept here", async () => {
    const provider = new DeviceIdentityProvider(memoryStorage());
    await expect(provider.isSignedIn()).resolves.toBe(true);
  });

  it("getIdentity() matches the pre-existing per-device HMAC derivation", async () => {
    const storage = memoryStorage();
    const provider = new DeviceIdentityProvider(storage, "device-abc");
    const id = await provider.getIdentity("boutique-express");
    expect(id).toBe(await deriveAppUserId("device-abc", "boutique-express"));
  });

  it("is stable across instances sharing the same storage (same generated device id)", async () => {
    const storage = memoryStorage();
    const first = new DeviceIdentityProvider(storage);
    const firstId = await first.getIdentity("boutique-express");
    const second = new DeviceIdentityProvider(storage);
    const secondId = await second.getIdentity("boutique-express");
    expect(firstId).toBe(secondId);
  });
});
