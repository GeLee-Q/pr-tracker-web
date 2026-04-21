import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GeLee-Q · read_slides",
  description: "Reading notes and PR tracker for RL training frameworks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
