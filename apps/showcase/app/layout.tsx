import type { ReactNode } from "react";
import "./style.css";

export const metadata = {
  title: "Proof Notes Showcase",
  description:
    "Agent E2E Harness showcase for seeded, repeatable proof journeys.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
