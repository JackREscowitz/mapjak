const path = require('path');

const rootDir = path.join(__dirname, '../..');
const uploadDir = path.join(rootDir, 'uploads');

module.exports = { rootDir, uploadDir };