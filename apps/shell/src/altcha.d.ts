import type { DetailedHTMLProps, HTMLAttributes } from "react";

/** <altcha-widget> from the `altcha` package (proof-of-work challenge, loaded in the browser). */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "altcha-widget": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        challenge?: string;
        name?: string;
        language?: string;
        auto?: "off" | "onfocus" | "onload" | "onsubmit";
        type?: "native" | "checkbox" | "switch";
        configuration?: string;
      };
    }
  }
}
