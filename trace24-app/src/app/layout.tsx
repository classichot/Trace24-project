import type { Metadata } from 'next';
import { Chakra_Petch } from 'next/font/google';
import './globals.css';

const chakraPetch = Chakra_Petch({
  variable: '--font-chakra',
  subsets: ['latin', 'thai'],
  weight: ['300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'TRACE24 — แพลตฟอร์มข้อมูลการใช้จ่ายภาครัฐ',
  description:
    'ตามเส้นทางเงิน ค้นหารูปแบบ แสดงหลักฐาน — แพลตฟอร์มข้อมูลการใช้จ่ายภาครัฐประเทศไทย',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={`${chakraPetch.variable} antialiased`}>{children}</body>
    </html>
  );
}
