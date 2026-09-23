/** SHA-256 via Web Crypto; identical in the browser and in Node 24. */
export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", view as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256OfText(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}
