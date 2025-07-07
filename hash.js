// hash.js
const bcrypt = require('bcrypt');

async function run() {
  const password = 'baobao';
  const hash = await bcrypt.hash(password, 10); // 10 rounds of salt
  console.log('Your hash:', hash);
}

run();
