import type { ReactNode } from "react";

export interface FooterProps {
  children: ReactNode;
}

export function Footer({ children }: FooterProps) {
  return <footer className="kp-footer">{children}</footer>;
}
