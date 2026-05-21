const https = require('https');
https.get('https://pabszzz.github.io/growmap-v4/', r => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => console.log('STATUS:', r.statusCode, 'BODY length:', d.length, 'Has GrowMap:', d.includes('GrowMap'), 'Has 502:', d.includes('502'), d.slice(0, 200)));
}).on('error', e => console.log('ERR:', e.message));
