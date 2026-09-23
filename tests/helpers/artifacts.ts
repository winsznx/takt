import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

export const readRepoFile = async (relative: string) => new Uint8Array(await readFile(path.join(ROOT, relative)));
export const form1Template = () => readRepoFile("legal/ca-dlse/form-1/source.pdf");
export const form55Template = () => readRepoFile("legal/ca-dlse/form-55/source.xls");
export const unicodeFont = () => readRepoFile("assets/fonts/NotoSans-Regular.ttf");
