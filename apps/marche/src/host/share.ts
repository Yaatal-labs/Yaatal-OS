export interface ShareParams {
  title?: string;
  text?: string;
  url?: string;
}

export interface ShareResult {
  shared: boolean;
  method: "web-share" | "clipboard";
}

export interface ShareCapableWindow {
  navigator: {
    share?: (data: ShareParams) => Promise<void>;
    clipboard?: { writeText: (text: string) => Promise<void> };
  };
}

/** Uses the Web Share sheet when available, otherwise copies the link/text to the clipboard. */
export async function performShare(params: ShareParams, windowRef: ShareCapableWindow): Promise<ShareResult> {
  if (typeof windowRef.navigator.share === "function") {
    await windowRef.navigator.share(params);
    return { shared: true, method: "web-share" };
  }

  const text = params.url ?? params.text ?? "";
  if (!text) {
    throw new Error("rien à partager");
  }
  if (!windowRef.navigator.clipboard) {
    throw new Error("le partage n'est pas disponible sur cet appareil");
  }
  await windowRef.navigator.clipboard.writeText(text);
  return { shared: true, method: "clipboard" };
}
