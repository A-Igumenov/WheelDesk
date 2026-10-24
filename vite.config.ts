import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed dev port and does not want Vite to clear the terminal.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Cargo can lock generated DLLs on Windows. Tauri watches Rust sources;
      // Vite only needs to watch the frontend, not Rust or its build output.
      ignored: [
        "**/src-tauri/**", "**/crates/**", "**/target/**", "**/target-*/**",
        "**/release/**", "**/graphify-out/**",
        "**/publication/**", "**/corresponding-source/**", "**/licenses/**",
      ],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: ["es2021", "chrome105", "safari15"],
    sourcemap: false,
  },
});
