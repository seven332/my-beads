import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// Keep the same artifact usable at a domain root or a GitHub Pages repository path.
export default defineConfig({ base: "./", plugins: [tailwindcss()] });
