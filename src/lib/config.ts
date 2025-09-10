import fs from 'fs';
import path from 'path';

export interface ServerConfig {
  server: {
    ip: string;
    port: number;
    protocol: string;
    domain: string;
  };
  ssl: {
    enabled: boolean;
    certPath: string;
    keyPath: string;
  };
  environment: string;
}

let configCache: ServerConfig | null = null;

export function getServerConfig(): ServerConfig {
  if (configCache) {
    return configCache;
  }

  try {
    const configPath = path.join(process.cwd(), 'config', 'server.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    configCache = JSON.parse(configData);
    return configCache!;
  } catch (error) {
    console.error('Error loading server config:', error);
    // Fallback configuration
    return {
      server: {
        ip: '27.107.17.167',
        port: 5001,
        protocol: 'https',
        domain: '27.107.17.167'
      },
      ssl: {
        enabled: true,
        certPath: './certs/cert.pem',
        keyPath: './certs/private.key'
      },
      environment: 'production'
    };
  }
}

export function getServerUrl(): string {
  const config = getServerConfig();
  return `${config.server.protocol}://${config.server.domain}:${config.server.port}`;
}

export function getServerIP(): string {
  const config = getServerConfig();
  return config.server.ip;
}

export function getServerPort(): number {
  const config = getServerConfig();
  return config.server.port;
}

export function isSSLEnabled(): boolean {
  const config = getServerConfig();
  return config.ssl.enabled;
}

export function getSSLCertPath(): string {
  const config = getServerConfig();
  return config.ssl.certPath;
}

export function getSSLKeyPath(): string {
  const config = getServerConfig();
  return config.ssl.keyPath;
}

// Clear cache function for development
export function clearConfigCache(): void {
  configCache = null;
}