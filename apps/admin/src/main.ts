import { createApp } from "vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import App from "./App.vue";
import { installHashRouter } from "./router";
import "./styles.css";
import "./styles/tokens.css";
import "./styles/admin-theme.css";

installHashRouter();
createApp(App).use(ElementPlus).mount("#app");
