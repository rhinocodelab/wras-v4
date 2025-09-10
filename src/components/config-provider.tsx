'use client';

import { useEffect } from 'react';
import { getClientConfig } from '@/lib/client-config';

export default function ConfigProvider() {
  useEffect(() => {
    // Fetch configuration from the server
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.config) {
            // Inject configuration into window object for global access
            (window as any).__CLIENT_CONFIG__ = data.config;
            console.log('Client configuration loaded:', data.config);
          }
        }
      } catch (error) {
        console.warn('Failed to load client configuration, using fallback:', error);
      }
    };

    fetchConfig();
  }, []);

  return null; // This component doesn't render anything
}