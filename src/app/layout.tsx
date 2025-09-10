import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import ConfigProvider from "@/components/config-provider";


export const metadata: Metadata = {
  title: 'WRAS-DDH',
  description: 'Western Railway Announcement System for Deaf and Hard of Hearing',
  icons: {
    icon: [
      {
        url: '/train-icon.svg',
        type: 'image/svg+xml',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <ConfigProvider />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
