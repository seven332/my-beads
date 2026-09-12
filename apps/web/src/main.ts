import { mountApp } from "./app.js";
import "./style.css";
const app = mountApp(document.querySelector<HTMLElement>("#app")!);
if (import.meta.hot) import.meta.hot.dispose(() => app.destroy());
