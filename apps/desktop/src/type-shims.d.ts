/// <reference types="vite/client" />
import type { RenderResult } from "@testing-library/react";

declare global {
  interface ImportMetaEnv {
    readonly VITE_YAATAL_UNIFIED_UI?: string;
  }
}

/** The installed React Testing Library runtime exports these DOM helpers, but its
 * isolated transitive DOM type package is not visible to this workspace. */
declare module "@testing-library/react" {
  export const screen: Pick<RenderResult, "findByRole" | "findByText" | "getAllByRole" | "getAllByText" | "getByLabelText" | "getByRole" | "getByText" | "queryByLabelText" | "queryByRole" | "queryByText">;
  export function waitFor<T>(callback: () => T | Promise<T>, options?: { timeout?: number; interval?: number }): Promise<T>;
}
