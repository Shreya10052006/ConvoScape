import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  // Character and hall assets are plain <img> on purpose: next/image adds a
  // layout pass and responsive srcset we don't want on a fixed-perspective plate.
};
export default nextConfig;

