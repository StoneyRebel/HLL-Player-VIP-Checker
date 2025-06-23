require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

console.log('🚀 Starting Hell Let Loose Discord Bot...');
console.log('📁 Project directory:', __dirname);

// Validate environment
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN not found in environment');
    process.exit(1);
}

if (!process.env.DISCORD_CLIENT_ID) {
    console.error('❌ DISCORD_CLIENT_ID not found in environment');
    process.exit(1);
}

// Create Discord client
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}!`);
    console.log(`🔗 Connected to ${client.guilds.cache.size} server(s)`);
});

client.on('error', (error) => {
    console.error('❌ Discord client error:', error);
});

// Login
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('❌ Failed to login:', error);
    process.exit(1);
});

console.log('✅ Bot initialization complete');
