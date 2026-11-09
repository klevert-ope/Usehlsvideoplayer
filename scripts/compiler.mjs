import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
// The unaliased TypeScript 6 package exists solely for ESLint's JS API.
const manifest = "typescript-native/package.json";
export const tsc = join(
  dirname(require.resolve(manifest)),
  require(manifest).bin.tsc,
);
