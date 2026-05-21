const https = require('https');
https.get('https://pabszzz.github.io/growmap-v4', r => {
  console.log('STATUS:', r.statusCode);
  console.log('LOCATION:', r.headers.location || 'NONE');
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => console.log('BODY:', d.slice(0, 200)));
}).on('error', e => console.log('ERR:', e.message));
