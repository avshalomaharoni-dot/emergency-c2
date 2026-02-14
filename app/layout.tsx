import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Emergency C2",
  description: "Emergency C2 POC",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-black">{children}</body>
    </html>
  );
}

