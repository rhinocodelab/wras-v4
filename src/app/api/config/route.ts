import { NextRequest, NextResponse } from 'next/server';
import { getServerConfig } from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    const config = getServerConfig();
    
    // Return only the necessary configuration for the client
    const clientConfig = {
      serverUrl: `${config.server.protocol}://${config.server.domain}:${config.server.port}`,
      serverIP: config.server.ip,
      serverPort: config.server.port,
      protocol: config.server.protocol,
      domain: config.server.domain
    };

    return NextResponse.json({
      success: true,
      config: clientConfig
    });
  } catch (error: any) {
    console.error('Error getting server config:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to get server configuration'
    }, { status: 500 });
  }
}