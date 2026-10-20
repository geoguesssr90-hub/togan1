import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // オフライン対応: ビルドした全ファイルを Service Worker でキャッシュする。
    // 新しい版は次に開いたときに自動で切り替わる（撮影中に勝手に再読み込みはしない）
    VitePWA({
      registerType: "autoUpdate",
      includeManifestIcons: false, // アイコンは下の globPatterns で拾う（二重登録を避ける）
      manifest: {
        name: "陶眼 データ収集",
        short_name: "陶眼収集",
        start_url: "/",
        display: "standalone",
        background_color: "#f4f1ea",
        theme_color: "#1f2a2e",
        lang: "ja",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // public/ の model.json（置いた場合）もキャッシュ対象に含める
        globPatterns: ["**/*.{js,css,html,png,svg,ico,json}"], // manifest はプラグインが自動で追加する
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: { environment: "node" },
} as any);
