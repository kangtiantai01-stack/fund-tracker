import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '基金持仓跟踪',
  description: '实时基金持仓跟踪与管理工具',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen bg-[#0c0f1a] antialiased">
        {children}
      </body>
    </html>
  );
}
