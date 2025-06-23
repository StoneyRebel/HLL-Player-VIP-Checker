const fs = require('fs').promises;
const path = require('path');

class DatabaseService {
    constructor(config) {
        this.config = config;
        this.dataDir = './data';
        this.playerLinks = new Map();
    }

    async initialize() {
        await fs.mkdir(this.dataDir, { recursive: true });
        await this.loadData();
    }

    async loadData() {
        try {
            const linksPath = path.join(this.dataDir, 'player_links.json');
            const linksData = await fs.readFile(linksPath, 'utf8');
            const parsed = JSON.parse(linksData);
            this.playerLinks = new Map(Object.entries(parsed));
        } catch (error) {
            this.playerLinks = new Map();
        }
    }

    async saveData() {
        try {
            const linksPath = path.join(this.dataDir, 'player_links.json');
            const linksData = Object.fromEntries(this.playerLinks);
            await fs.writeFile(linksPath, JSON.stringify(linksData, null, 2));
        } catch (error) {
            console.error('Error saving data:', error);
        }
    }

    async getPlayerByDiscordId(discordId) {
        return this.playerLinks.get(discordId) || null;
    }

    async getPlayerBySteamId(steamId) {
        for (const [_, playerData] of this.playerLinks) {
            if (playerData.steamId === steamId) {
                return playerData;
            }
        }
        return null;
    }

    async getAllPlayers() {
        return Array.from(this.playerLinks.values());
    }

    async createPlayerLink(linkData) {
        this.playerLinks.set(linkData.discordId, {
            ...linkData,
            linkedAt: new Date().toISOString()
        });
        await this.saveData();
    }

    async deletePlayerLink(discordId) {
        this.playerLinks.delete(discordId);
        await this.saveData();
    }

    async getPlayerCount() {
        return this.playerLinks.size;
    }

    async close() {
        await this.saveData();
    }
}

module.exports = DatabaseService;
