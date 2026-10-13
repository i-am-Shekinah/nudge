import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Emit /route/index.html instead of route.html so the export can be served
  // by a plain static server and by the Capacitor WebView without rewrites.
  trailingSlash: true,
};

export default nextConfig;
