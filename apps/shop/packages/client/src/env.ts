const DEFAULT_ENGINE_API_URL = "http://localhost:5150";

export interface EngineRuntimeEnv {
  EXPO_PUBLIC_ENGINE_API_URL?: string;
  YAATAL_ENGINE_API_URL?: string;
}

function runtimeEnv(): EngineRuntimeEnv {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: EngineRuntimeEnv };
  };

  return runtime.process?.env ?? {};
}

export function getEngineApiUrl(env: EngineRuntimeEnv = runtimeEnv()): string {
  return (
    env.EXPO_PUBLIC_ENGINE_API_URL ??
    env.YAATAL_ENGINE_API_URL ??
    DEFAULT_ENGINE_API_URL
  ).replace(/\/+$/, "");
}
