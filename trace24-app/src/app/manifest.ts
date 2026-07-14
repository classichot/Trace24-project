import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TRACE24 — ตามรอยการใช้จ่ายภาครัฐ',
    short_name: 'TRACE24',
    description:
      'แพลตฟอร์มข้อมูลการใช้จ่ายภาครัฐประเทศไทย — ตามเส้นทางเงิน ค้นหารูปแบบ แสดงหลักฐาน',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#FBFBF9',
    theme_color: '#FBFBF9',
    lang: 'th',
    categories: ['government', 'finance', 'utilities'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
