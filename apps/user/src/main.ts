import { createSSRApp } from "vue";
import App from "./App.vue";

export function createApp() {
  const app = createSSRApp(App);
  app.config.errorHandler = (err, _instance, info) => {
    console.error(`[APP_ERROR] info=${info} message=${toErrorMessage(err)}`, err);
  };

  return {
    app
  };
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
