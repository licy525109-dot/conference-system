<script setup lang="ts">
import { onLaunch, onShow } from "@dcloudio/uni-app";
import { saveLaunchOptions } from "@/utils/launch";

onLaunch((options) => {
  console.log("[APP_LAUNCH]", options);
  saveLaunchOptions(options);
});

onShow((options) => {
  console.log("[APP_SHOW]", options);
  saveLaunchOptions(options);
});
</script>

<style>
@import "./styles/tokens.css";

page {
  min-height: 100%;
  background: var(--ui-color-bg);
  color: var(--ui-color-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

button {
  margin: 0;
}

button::after {
  border: 0;
}
</style>
