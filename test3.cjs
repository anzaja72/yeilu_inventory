const https = require('https');

https.get('https://script.google.com/macros/s/AKfycbzYf1o2Q0DNm2hGPksEYP8GQ5nOhVRt48mnDp41n6igS5mdq3uezQA40BRQWvIYjQlVnA/exec?action=GET_ALL', (res) => {
  if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
    https.get(res.headers.location, (res2) => {
      let data = '';
      res2.on('data', (chunk) => data += chunk);
      res2.on('end', () => {
        const json = JSON.parse(data);
        console.log(Object.keys(json));
      });
    });
  }
});
