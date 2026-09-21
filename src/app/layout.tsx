import type { Metadata, Viewport } from 'next';
import './globals.css';
import { themeBootScript } from '@/components/ThemeToggle';
import { LangProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Tyler Investment Tool',
  description: 'Lọc cơ hội bán cash-secured put trong rổ S&P 500 qua Schwab API',
  /* Không có dòng này thì KHÔNG trình duyệt nào coi trang là cài được, và
     đó đúng là lý do trước #205 không đâu có chữ "Install app". File nằm ở
     `public/` chứ không sinh động: `middleware.ts` đã chừa sẵn đuôi
     `.webmanifest` khỏi cổng đăng nhập, mà trình duyệt tải manifest KHÔNG
     kèm cookie — gác nó là nó nhận về trang đăng nhập và coi như hỏng. */
  manifest: '/manifest.webmanifest',
  icons: {
    /* iOS bỏ qua icon trong manifest và đọc đúng thẻ này; thiếu nó thì màn
       hình chính hiện một ảnh CHỤP MÀN HÌNH trang web. Ảnh phải ĐẶC: iOS
       đọc alpha thành nền đen. */
    apple: '/apple-touch-icon.png',
  },
};

/* Màu thanh trạng thái khi chạy ở chế độ app. Manifest chỉ mang được MỘT
   giá trị, mà app này đổi theo theme của máy — nên màu thật đặt ở đây, hai
   giá trị theo `prefers-color-scheme`, và khớp `--card` (nền thanh đầu
   trang) chứ không phải `--paper`: thanh trạng thái nằm ngay trên nó. */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#161a1d' },
  ],
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
      <body>
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
