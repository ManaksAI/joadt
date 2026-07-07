import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dashboard imports the control-plane roster from ../tentacles, so allow it.
export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: [".."] },
    proxy: { "/api": "http://localhost:8790" },
  },
  test: { environment: "node", include: ["test/**/*.test.js", "src/**/*.test.{js,jsx}"] },
});
