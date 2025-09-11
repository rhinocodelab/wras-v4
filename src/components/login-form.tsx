'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { login } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Lock, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

const initialState: { message: string, errors?: any } = {
  message: '',
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full py-3 text-sm font-medium rounded-lg" disabled={pending}>
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      {pending ? 'Signing In...' : 'Sign In'}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(login, initialState);

  return (
    <div className="flex h-full flex-col justify-center">
      <form action={formAction} className="space-y-4">
        <div>
            <Label htmlFor="email" className='text-sm font-medium text-gray-700 mb-2 block'>Username</Label>
            <div className="relative flex items-center">
              <User className="absolute left-3 h-4 w-4 text-gray-400" />
              <Input
                id="email"
                name="email"
                type="text"
                placeholder="Enter username"
                required
                className="w-full pl-10 pr-4 py-3 text-sm border-gray-300 focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-all duration-200 rounded-lg"
                aria-describedby="email-error"
              />
            </div>
            {state.errors?.email && (
              <p id="email-error" className="text-sm text-destructive mt-1">{state.errors.email[0]}</p>
            )}
        </div>
        <div>
            <Label htmlFor="password" className='text-sm font-medium text-gray-700 mb-2 block'>Password</Label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3 h-4 w-4 text-gray-400" />
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Enter password"
                required
                className="w-full pl-10 pr-4 py-3 text-sm border-gray-300 focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-all duration-200 rounded-lg"
                aria-describedby="password-error"
              />
            </div>
            {state.errors?.password && (
              <p id="password-error" className="text-sm text-destructive mt-1">{state.errors.password[0]}</p>
            )}
        </div>
        
        {state.message && !state.errors && (
            <Alert variant="destructive" className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Authentication Failed</AlertTitle>
                <AlertDescription>{state.message}</AlertDescription>
            </Alert>
        )}

        <SubmitButton />
      </form>
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-sm text-gray-700 mb-2 font-medium">Default Credentials:</p>
         <p className="text-sm text-gray-600">Username: <span className="font-mono font-semibold text-gray-900">admin</span></p>
         <p className="text-sm text-gray-600">Password: <span className="font-mono font-semibold text-gray-900">wras@dhh</span></p>
      </div>
    </div>
  );
}