import type { Metadata } from "next";
import "./globals.css";
import "./lab.css";
import "./simple-lab.css";

export const metadata: Metadata = {
  title: "Irish Electrical Lab",
  description: "A local 3D electrical study workbench with 64 Irish domestic and industrial configurations.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
