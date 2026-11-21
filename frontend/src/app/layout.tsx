import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Web Notebook",
  description: "Интерактивный блокнот для веб-разработки",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
