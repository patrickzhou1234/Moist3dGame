const db = require('./database');

const username = process.argv[2];

if (!username) {
    console.log('Usage: node make_vip.js <username>');
    process.exit(1);
}

const success = db.setUserVIPByUsername(username, true);

if (success) {
    console.log(`User "${username}" is now a VIP! ⭐`);
} else {
    console.log(`User "${username}" not found.`);
}
