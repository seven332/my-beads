import "i18next";
import type common from "./locales/en-US.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    enableSelector: true;
    resources: { common: typeof common };
    returnNull: false;
  }
}
