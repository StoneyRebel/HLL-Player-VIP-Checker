#!/usr/bin/env node

console.log('🚀 Hell Let Loose Discord Bot - Setup Wizard');
console.log('=============================================');

const fs = require('fs');
const path = require('path');

// Create data directories
const dataDir = path.join(__dirname, '..', 'data');
const logsDir = path.join(__dirname, '..', 'logs');

try {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('✅ Created data directory');
    }
    
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
        console.log('✅ Created logs directory');
    }

    // Create initial data files
    const playerLinksPath = path.join(dataDir, 'player_links.json');
    if (!fs.existsSync(playerLinksPath)) {
        fs.writeFileSync(playerLinksPath, '{}');
        console.log('✅ Created player_links.json');
    }

    const contestDataPath = path.join(dataDir, 'contest_data.json');
    if (!fs.existsSync(contestDataPath)) {
        fs.writeFileSync(contestDataPath, '{"currentContest": null, "submissions": {}}');
        console.log('✅ Created contest_data.json');
    }

    console.log('');
    console.log('✅ Setup completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Copy .env.example to .env');
    console.log('2. Configure your Discord bot token and CRCON settings');
    console.log('3. Run: npm start');

} catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
}
