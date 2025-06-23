#!/usr/bin/env node
require('dotenv').config();

console.log('🔍 Hell Let Loose Discord Bot - Health Check');
console.log('===========================================');

const fs = require('fs');
const path = require('path');

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion >= 16) {
    console.log(`✅ Node.js ${nodeVersion} - Compatible`);
} else {
    console.log(`❌ Node.js ${nodeVersion} - Upgrade to 16+ required`);
}

// Check environment
if (process.env.DISCORD_TOKEN) {
    console.log('✅ Discord token configured');
} else {
    console.log('❌ Discord token missing');
}

if (process.env.DISCORD_CLIENT_ID) {
    console.log('✅ Discord client ID configured');
} else {
    console.log('❌ Discord client ID missing');
}

// Check directories
const dataDir = path.join(__dirname, '..', 'data');
const logsDir = path.join(__dirname, '..', 'logs');

if (fs.existsSync(dataDir)) {
    console.log('✅ Data directory exists');
} else {
    console.log('❌ Data directory missing');
}

if (fs.existsSync(logsDir)) {
    console.log('✅ Logs directory exists');
} else {
    console.log('❌ Logs directory missing');
}

console.log('');
console.log('Health check completed!');
