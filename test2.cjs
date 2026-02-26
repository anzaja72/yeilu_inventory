const https = require('https');

https.get('https://icad-n8n.ltubgr.easypanel.host/webhook/api/consulta-inventario', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log(Object.keys(json));
  });
});
