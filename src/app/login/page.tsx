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
          <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex flex-col lg:flex-row">
              {/* Left Side - Information and Logo */}
              <div className="flex w-full flex-col items-center justify-center bg-gradient-to-br from-primary to-primary/80 p-6 text-white lg:w-1/2 relative overflow-hidden">
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute top-10 left-10 w-32 h-32 border border-white/20 rounded-full"></div>
                  <div className="absolute top-32 right-16 w-24 h-24 border border-white/20 rounded-full"></div>
                  <div className="absolute bottom-20 left-20 w-40 h-40 border border-white/20 rounded-full"></div>
                  <div className="absolute bottom-32 right-10 w-28 h-28 border border-white/20 rounded-full"></div>
                </div>
                
                {/* POC Demo Badge */}
                <div className="absolute top-4 left-4">
                  <div className="px-4 py-2 bg-white/20 rounded-full text-sm font-semibold backdrop-blur-sm">
                    POC DEMO
                  </div>
                </div>
                
                {/* Main Content */}
                <div className="text-center max-w-md z-10">
                  <p className="mb-4 text-xl leading-relaxed text-blue-100">
                    Western Railway Announcement System for Deaf and Hard of Hearing
                  </p>
                  
                  <div className="mx-auto mb-4 h-1 w-16 bg-white/30 rounded-full"></div>
                  
                  <p className="text-sm text-blue-100 leading-relaxed">
                    Empowering accessibility through
                    <br />
                    AI-powered visual railway announcements
                  </p>
                  
                  {/* Features List */}
                  <div className="mt-6 text-left">
                    <h3 className="text-base font-semibold mb-3 text-left">Key Features</h3>
                    <ul className="space-y-1 text-xs text-blue-100">
                      <li className="flex items-center">
                        <div className="w-2 h-2 bg-white/60 rounded-full mr-3"></div>
                        Real-time ISL video generation
                      </li>
                      <li className="flex items-center">
                        <div className="w-2 h-2 bg-white/60 rounded-full mr-3"></div>
                        Multi-language support
                      </li>
                      <li className="flex items-center">
                        <div className="w-2 h-2 bg-white/60 rounded-full mr-3"></div>
                        AI-powered avatar models
                      </li>
                      <li className="flex items-center">
                        <div className="w-2 h-2 bg-white/60 rounded-full mr-3"></div>
                        Accessible railway announcements
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              
              {/* Right Side - Login Form */}
              <div className="flex w-full flex-col justify-center p-6 lg:w-1/2">
                {/* Logo */}
                <div className="mb-6 text-center">
                  <img 
                    src="/logo.png" 
                    alt="Logo" 
                    className="mx-auto"
                  />
                </div>
                
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
