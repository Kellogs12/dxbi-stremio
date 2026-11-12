/**
 * launch.js — Hank webOS TV Node.js background service
 * Listens on 127.0.0.1:8080, serves Stremio Web with Hank pre-injected,
 * and responds to webOS Luna bus lifecycle events.
 */

try {
  process.env.NODE_PATH = (process.env.NODE_PATH || '') + ':/usr/lib/node_modules:/usr/lib/nodejs';
  if (require('module').Module._initPaths) require('module').Module._initPaths();
} catch (_) {}

var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');
var url = require('url');

var PORT = parseInt(process.env.PORT || '8080', 10);
var ready = false;
var pendingMessages = [];

// Optional webOS Luna service registration
try {
  var Service = require('webos-service');
  var service = new Service('com.kellogs12.hank.tv.server');
  if (service.activityManager && service.activityManager.create) {
    service.activityManager.create('keepAlive', function() {});
  }
  service.register('start', function(message) {
    if (ready) {
      message.respond({ ready: true });
    } else {
      pendingMessages.push(message);
    }
  });
} catch (_) {
  console.log('[Hank webOS Service] Running in standalone HTTP mode');
}

// Local asset paths
var staticDir = __dirname;
var appDir = path.join(__dirname, '..', 'app');

function findAsset(filename) {
  var candidates = [
    path.join(staticDir, filename),
    path.join(appDir, filename),
    path.join(__dirname, '..', '..', filename)
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return null;
}

// Cached index.html
var cachedHtml = null;
var cacheTime = 0;
var CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function fetchStremioHtml(cb) {
  if (cachedHtml && (Date.now() - cacheTime < CACHE_TTL_MS)) {
    return cb(null, cachedHtml);
  }

  var req = https.get('https://web.stremio.com/', { headers: { 'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Safari/537.36 dxbi-tv/2.35.1' } }, function(res) {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return cb(new Error('Redirected'));
    }
    var body = '';
    res.setEncoding('utf8');
    res.on('data', function(chunk) { body += chunk; });
    res.on('end', function() {
      if (res.statusCode !== 200 || !body) return cb(new Error('HTTP ' + res.statusCode));

      // Inject Hank scripts & styles
      var injections = [
        '<title>Hank</title>',
        '<link rel="stylesheet" href="/dxbi.theme.css">',
        '<script src="/hank-webos.js"></script>',
        '<script src="/dxbi.plugin.js"></script>'
      ].join('');

      // Replace <title> or insert before </head>
      var modified = body;
      if (modified.indexOf('</head>') !== -1) {
        modified = modified.replace('</head>', injections + '</head>');
      } else {
        modified = injections + modified;
      }

      cachedHtml = modified;
      cacheTime = Date.now();
      cb(null, modified);
    });
  });

  req.on('error', function(err) {
    if (cachedHtml) return cb(null, cachedHtml);
    cb(err);
  });
  req.setTimeout(8000, function() { req.abort(); });
}

function proxyStremio(req, res) {
  var parsed = url.parse(req.url);
  var options = {
    hostname: 'web.stremio.com',
    port: 443,
    path: parsed.path,
    method: req.method,
    headers: Object.assign({}, req.headers, {
      host: 'web.stremio.com',
      referer: 'https://web.stremio.com/'
    })
  };

  var proxy = https.request(options, function(remoteRes) {
    res.writeHead(remoteRes.statusCode, remoteRes.headers);
    remoteRes.pipe(res);
  });
  proxy.on('error', function() {
    try {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Gateway Error');
    } catch (_) {}
  });
  req.pipe(proxy);
}

// HTTP Server
var server = http.createServer(function(req, res) {
  var parsed = url.parse(req.url);
  var pathname = parsed.pathname || '/';

  // Healthcheck
  if (pathname === '/favicon.ico') {
    res.writeHead(200, { 'Content-Type': 'image/x-icon', 'Content-Length': '0' });
    return res.end();
  }

  // Local assets
  if (pathname === '/dxbi.plugin.js' || pathname === '/dxbi.theme.css' || pathname === '/hank-webos.js') {
    var assetName = pathname.slice(1);
    var assetPath = findAsset(assetName);
    if (assetPath) {
      var contentType = assetName.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8';
      res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(assetPath).pipe(res);
    }
  }

  // Root HTML: Serve web.stremio.com with Hank injected
  if (pathname === '/' || pathname === '/index.html') {
    return fetchStremioHtml(function(err, html) {
      if (err || !html) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<!doctype html><html><body style="background:#0b0b0d;color:#fff;font-family:sans-serif;padding:32px"><h2>Hank is loading…</h2><p>Please check your TV internet connection and refresh.</p><button onclick="location.reload()" style="padding:10px 24px;font-size:18px;background:#e50914;color:#fff;border:0;border-radius:4px;cursor:pointer">Retry</button></body></html>');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
  }

  // Proxy all other static assets (main.js, styles, wasm) to web.stremio.com
  proxyStremio(req, res);
});

server.listen(PORT, '127.0.0.1', function() {
  ready = true;
  console.log('[Hank webOS Server] Listening on http://127.0.0.1:' + PORT);
  pendingMessages.forEach(function(msg) {
    try { msg.respond({ ready: true }); } catch (_) {}
  });
  pendingMessages = [];
});
