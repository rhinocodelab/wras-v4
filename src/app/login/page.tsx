import { getSession } from '@/app/actions';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/login-form';
import { TramFront } from 'lucide-react';
import Head from 'next/head';

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect('/');
  }

  return (
    <>
      <Head>
        <link rel="icon" type="image/svg+xml" href="/train-icon.svg" />
      </Head>
      <div className="flex min-h-screen w-full flex-col bg-gray-100">
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-2xl">
          <div className="flex flex-col md:flex-row">
            <div className="flex w-full flex-col items-center justify-center bg-primary p-8 text-white md:w-1/2 relative">
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
                <div className="text-4xl font-bold text-white/20 select-none">
                  POC DEMO
                </div>
              </div>
              <div className="text-center">
                <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                  <TramFront className="h-6 w-6 text-white" />
                </div>
                <h1 className="mb-2 text-xl font-bold">WRAS-DHH</h1>
                <p className="mb-3 text-sm leading-relaxed text-blue-100">
                  Western Railway Announcement System
                  <br />
                  for Deaf and Hard of Hearing
                </p>
                <div className="mx-auto mb-3 h-0.5 w-12 bg-white/30"></div>
                <p className="text-sm text-blue-100">
                  Empowering accessibility through
                  <br />
                  AI-powered visual railway announcements
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col justify-center p-8 md:w-1/2">
              <LoginForm />
            </div>
          </div>
        </div>
      </main>
      <footer className="border-t bg-white p-3">
        <div className="text-center text-base font-bold text-muted-foreground">
          Designed and Developed by <a href="https://www.sundynegroup.com/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground underline">Sundyne Technologies</a> © 2025
        </div>
      </footer>
    </div>
    </>
  );
}
