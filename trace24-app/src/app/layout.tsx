import type { Metadata, Viewport } from 'next';
import { Chakra_Petch } from 'next/font/google';
import { PwaRegister } from '@/components/pwa-register';
import './globals.css';

const chakraPetch = Chakra_Petch({
  variable: '--font-chakra',
  subsets: ['latin', 'thai'],
  weight: ['300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  applicationName: 'TRACE24',
  title: 'TRACE24 — แพลตฟอร์มข้อมูลการใช้จ่ายภาครัฐ',
  description:
    'ตามเส้นทางเงิน ค้นหารูปแบบ แสดงหลักฐาน — แพลตฟอร์มข้อมูลการใช้จ่ายภาครัฐประเทศไทย',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TRACE24',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBFBF9' },
    { media: '(prefers-color-scheme: dark)', color: '#FBFBF9' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={`${chakraPetch.variable} antialiased`}>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
