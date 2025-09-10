#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get IP address from command line argument
const newIP = process.argv[2];

if (!newIP) {
  console.error('❌ Error: Please provide an IP address');
  console.log('Usage: node scripts/update-config.js <IP_ADDRESS>');
  console.log('Example: node scripts/update-config.js 27.107.17.167');
  process.exit(1);
}

// Validate IP address format (basic validation)
const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
if (!ipRegex.test(newIP)) {
  console.error('❌ Error: Invalid IP address format');
  console.log('Please provide a valid IPv4 address (e.g., 192.168.1.100)');
  process.exit(1);
}

const configPath = path.join(__dirname, '..', 'config', 'server.json');

try {
  // Read current configuration
  let config;
  if (fs.existsSync(configPath)) {
    const configData = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configData);
  } else {
    // Create default configuration
    config = {
      server: {
        ip: newIP,
        port: 5001,
        protocol: 'https',
        domain: newIP
      },
      ssl: {
        enabled: true,
        certPath: './certs/cert.pem',
        keyPath: './certs/private.key'
      },
      environment: 'production'
    };
  }

  // Update IP address in configuration
  const oldIP = config.server.ip;
  config.server.ip = newIP;
  config.server.domain = newIP;

  // Write updated configuration
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log('✅ Configuration updated successfully!');
  console.log(`📝 IP Address changed from ${oldIP} to ${newIP}`);
  console.log(`📁 Configuration file: ${configPath}`);
  console.log('');
  console.log('🔧 Next steps:');
  console.log('1. Generate new SSL certificates: npm run generate-ssl');
  console.log('2. Restart the server: npm run start:https');
  console.log('3. Update any external references to the old IP address');

} catch (error) {
  console.error('❌ Error updating configuration:', error.message);
  process.exit(1);
}