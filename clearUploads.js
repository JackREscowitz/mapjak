// Script for testing purposes to clear uploads

const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, 'uploads');
const uploadsJson = path.join(__dirname, 'uploads.json');

// Clear uploads.json
fs.writeFileSync(uploadsJson, '[]');
console.log('Cleared uploads.json!');

// Clear files in uploads/ directory
if (fs.existsSync(uploadsDir)) {
    fs.readdirSync(uploadsDir).forEach(file => {
        const filePath = path.join(uploadsDir, file);
        fs.unlinkSync(filePath);
    });
    console.log('Cleared uploads/ directory!');
} else {
    console.log('uploads/ directory does not exist yet.');
}

console.log('All clear!');