import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCES = [
  [
    "node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm",
    "tree-sitter-typescript.wasm",
  ],
  ["node_modules/tree-sitter-typescript/tree-sitter-tsx.wasm", "tree-sitter-tsx.wasm"],
  [
    "node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm",
    "tree-sitter-javascript.wasm",
  ],
  ["node_modules/tree-sitter-python/tree-sitter-python.wasm", "tree-sitter-python.wasm"],
  ["node_modules/tree-sitter-go/tree-sitter-go.wasm", "tree-sitter-go.wasm"],
  ["node_modules/tree-sitter-rust/tree-sitter-rust.wasm", "tree-sitter-rust.wasm"],
  ["node_modules/tree-sitter-java/tree-sitter-java.wasm", "tree-sitter-java.wasm"],
  ["node_modules/web-tree-sitter/web-tree-sitter.wasm", "web-tree-sitter.wasm"],
];

const targetDir = resolve(root, "dist/grammars");
if (!existsSync(resolve(root, "node_modules/web-tree-sitter"))) {
  console.log("skip grammar copy: dependencies not installed yet");
  process.exit(0);
}

mkdirSync(targetDir, { recursive: true });

for (const [src, name] of SOURCES) {
  const srcPath = resolve(root, src);
  if (!existsSync(srcPath)) {
    console.warn(`skip missing ${src}`);
    continue;
  }
  const dst = resolve(targetDir, name);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(srcPath, dst);
  console.log(`copied ${src} → ${dst}`);
}
