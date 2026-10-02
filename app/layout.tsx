import type { Metadata } from "next";
import "./globals.css";
import "./motion.css";
import "./admin-mail.css";
import "./auth.css";

export const metadata: Metadata = {
  title: "Thon Hub | Powered by Edutantr",
  description: "Discover and join Edutantr workshops, webinars, hackathons and events. Learn, build and connect with Thon Hub.",
  referrer: "no-referrer",
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
