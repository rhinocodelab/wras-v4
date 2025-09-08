const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = process.env.PORT || 9002;

// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// SSL certificate paths
const certPath = path.join(__dirname, 'certs', 'server.crt');
const keyPath = path.join(__dirname, 'certs', 'server.key');

// Check if certificates exist
const certExists = fs.existsSync(certPath);
const keyExists = fs.existsSync(keyPath);

if (!certExists || !keyExists) {
  console.error('SSL certificates not found!');
  console.error('Please run: ./generate_cert.sh <YOUR_IP_ADDRESS>');
  console.error('Expected files:');
  console.error(`  - ${certPath}`);
  console.error(`  - ${keyPath}`);
  process.exit(1);
}

// Read SSL certificates
const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

app.prepare().then(() => {
  createServer(httpsOptions, async (req, res) => {
    try {
      // Be sure to pass `true` as the second argument to `url.parse`.
      // This tells it to parse the query portion of the URL.
      const parsedUrl = parse(req.url, true);
      const { pathname, query } = parsedUrl;

      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  })
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      console.log(`> Ready on https://${hostname}:${port}`);
      console.log(`> Frontend running with HTTPS`);
      console.log(`> Certificate: ${certPath}`);
    });
});