import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 相對路徑 base：無論放在 https://<user>.github.io/<repo>/ 或任何子目錄都可用
  base: "./",
  server: {
    // 區網內其他裝置也想測試時，改用 0.0.0.0
    port: 5173,
    host: "127.0.0.1",
    watch: {
      // 1200E 資料區有上百個音檔，排除監看以免 dev server 一直重啟、檔案被鎖
      ignored: ["**/1200E/**"],
    },
  },
});
