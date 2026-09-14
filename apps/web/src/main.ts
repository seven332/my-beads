import { mountApp } from "./app.js";
import "./style.css";
const app = mountApp(document.querySelector<HTMLElement>("#app")!, {
  themeRoot: document.documentElement,
});
if (import.meta.hot) import.meta.hot.dispose(() => app.destroy());
