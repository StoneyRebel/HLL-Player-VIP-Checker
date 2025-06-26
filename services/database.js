const fs = require('fs').promises;
const path = require('path');
const Logger = require('../utils/logger');

class DatabaseService {
    constructor(config) {
        this.config = config;
        this.dataDir = path.dirname(config.filename) || './data';
        this.playerLinks = new Map();
        
        this.paths = {
            playerLinks: path.join(this.dataDir, 'player_links.json'),
            vipNotifications: path.join(this.dataDir, 'vip_notifications.json'),
            contest: path.join(this.dataDir, 'contest_data.json'),
            leaderboard: path.join(this.dataDir, 'leaderboard_settings.json')
        };
    }

    async initialize() {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
            await this.loadPlayerLinks();
            Logger.info(`📊 Database initialized with ${this.playerLinks.size} player links`);
        } catch (error) {
            Logger.error('❌ Database initialization failed:', error);
            throw error;
        }
    }

    async loadPlayerLinks() {
        try {
            const data = await fs.readFile(this.paths.playerLinks, 'utf8');
            const parsed = JSON.parse(data);
        
        // Validate data structure
        if (typeof parsed !== 'object' || parsed === null) {
            throw new Error('Invalid data format: expected object');
        }
            this.playerLinks = new Map(Object.entries(parsed));
        } catch (error) {
            if (error.code !== 'ENOENT') {
                Logger.error('Error loading player links:', error);
            }
            this.playerLinks = new Map();
        }
    }

    async getPlayerByDiscordId(discordId) {
        return this.playerLinks.get(discordId) || null;
    }

    async getPlayerBySteamId(steamId) {
        for (const [discordId, playerData] of this.playerLinks) {
            if (playerData.steamId === steamId) {
                return { ...playerData, discordId };
            }
        }
        return null;
    }

    async getAllPlayers() {
        return Array.from(this.playerLinks.entries()).map(([discordId, data]) => ({
            discordId,
            ...data
        }));
    }

    async createPlayerLink(linkData) {
        this.playerLinks.set(linkData.discordId, {
            t17Username: linkData.t17Username,
            displayName: linkData.displayName,
            steamId: linkData.steamId,
            platform: linkData.platform,
            lastSeen: linkData.lastSeen,
            linkedAt: new Date().toISOString()
        });
        await this.savePlayerLinks();
    }

    async deletePlayerLink(discordId) {
        const deleted = this.playerLinks.delete(discordId);
        if (deleted) {
            await this.savePlayerLinks();
        }
        return deleted;
    }

    async getPlayerCount() {
        return this.playerLinks.size;
    }

    async savePlayerLinks() {
        try {
            const data = Object.fromEntries(this.playerLinks);
            await fs.writeFile(this.paths.playerLinks, JSON.stringify(data, null, 2));
        } catch (error) {
            Logger.error('Error saving player links:', error);
        }
    }

    async close() {
        await this.savePlayerLinks();
    }
}

module.exports = DatabaseService;
