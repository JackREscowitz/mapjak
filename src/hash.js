// hash.js
// Usage: node hash.js yourpassword

const bcrypt = require('bcrypt');

const password = process.argv[2]; // get the password from command line args

if (!password) {
    console.error('Usage: node hash.js yourpassword');
    process.exit(1);
}

const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
        console.error('Error hashing password:', err);
        process.exit(1);
    }
    console.log(`Plaintext: ${password}`);
    console.log(`Hashed: ${hash}`);
});
