import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";

const vazir = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-rubik",
});

export const metadata: Metadata = {
  title: "منچ بازی",
  description: "منچ چندنفره برای چهار، پنج یا شش بازیکن. اتاق همتابه‌همتا، بدون سرور بازی.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className={`${vazir.variable} h-full antialiased`}>
      <body className="min-h-dvh text-[#16324d]">{children}</body>
    </html>
  );
}
