import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FRIDAY | AI Assistant",
  description: "Futuristic AI Assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased bg-black`}
      suppressHydrationWarning
    >
      <body className="h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
