import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anima Curo – Intelligent Practice Finance",
  description: "Automated rate management, bank reconciliation & dunning for medical practices – powered by AI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
