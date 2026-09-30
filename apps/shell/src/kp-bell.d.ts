import type { DetailedHTMLProps, HTMLAttributes } from "react";

/** <kp-bell> is the runtime widget from @kundenportal/widget-notifications (/widgets/bell.js). */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "kp-bell": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        label?: string;
        href?: string;
        src?: string;
        interval?: string;
      };
    }
  }
}
