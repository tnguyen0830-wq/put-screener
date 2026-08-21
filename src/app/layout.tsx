import type { Metadata } from 'next';
import './globals.css';
import { themeBootScript } from '@/components/ThemeToggle';

export const metadata: Metadata = {
  title: 'Tyler Investment Tool',
  description: 'Lọc cơ hội bán cash-secured put trong rổ S&P 500 qua Schwab API',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Script chống nháy đặt data-theme trước khi React dựng cây, nên HTML từ
    // server và DOM lúc hydrate lệch nhau ở đúng thuộc tính đó. Đây là lệch có
    // chủ ý, không phải lỗi.
    <html lang="vi" suppressHydrationWarning>
      <head>
        {/* Chạy trước khi React dựng cây để không nháy nền sáng rồi mới sang tối. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
