// Client-side configuration utility
// This will be populated by the server at build time or runtime

export interface ClientConfig {
  serverUrl: string;
  serverIP: string;
  serverPort: number;
  protocol: string;
  domain: string;
}

let clientConfigCache: ClientConfig | null = null;

// Function to get client configuration
export function getClientConfig(): ClientConfig {
  if (clientConfigCache) {
    return clientConfigCache;
  }

  // Try to get config from window object (set by server)
  if (typeof window !== 'undefined' && (window as any).__CLIENT_CONFIG__) {
    clientConfigCache = (window as any).__CLIENT_CONFIG__;
    return clientConfigCache!;
  }

  // Fallback configuration
  return {
    serverUrl: 'https://27.107.17.167:5001',
    serverIP: '27.107.17.167',
    serverPort: 5001,
    protocol: 'https',
    domain: '27.107.17.167'
  };
}

export function getServerUrl(): string {
  const config = getClientConfig();
  return config.serverUrl;
}

export function getServerIP(): string {
  const config = getClientConfig();
  return config.serverIP;
}

export function getServerPort(): number {
  const config = getClientConfig();
  return config.serverPort;
}

export function getProtocol(): string {
  const config = getClientConfig();
  return config.protocol;
}

export function getDomain(): string {
  const config = getClientConfig();
  return config.domain;
}

// Clear cache function
export function clearClientConfigCache(): void {
  clientConfigCache = null;
}