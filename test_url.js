const fs = require('fs');
const t = fs.readFileSync('vercel_js_dump.js', 'utf8');
console.log("Length:", t.length);
const m = t.match(/http[^\"']+/g);
if (m) console.log(m.filter(u => !u.includes('w3.org') && !u.includes('lucide')));
