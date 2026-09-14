import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Keep the same artifact usable at a domain root or a GitHub Pages repository path.
export default defineConfig({
  base: "./",
  plugins: [
    tailwindcss(),
    {
      name: "inline-theme-bootstrap",
      transformIndexHtml: {
        order: "post",
        async handler() {
          const result = await build({
            entryPoints: [fileURLToPath(new URL("./src/theme-bootstrap.ts", import.meta.url))],
            bundle: true,
            write: false,
            format: "iife",
            minify: true,
            target: "es2022",
          });
          return [
            { tag: "script", children: result.outputFiles[0].text, injectTo: "head-prepend" },
          ];
        },
      },
    },
  ],
});
