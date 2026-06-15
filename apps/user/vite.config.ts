import { defineConfig } from "vite";
import uniPlugin from "@dcloudio/vite-plugin-uni";

const uni = "default" in uniPlugin ? uniPlugin.default : uniPlugin;

export default defineConfig({
  envDir: "../..",
  plugins: [uni()]
});
