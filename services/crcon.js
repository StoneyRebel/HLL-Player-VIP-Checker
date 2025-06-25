const axios = require('axios');
const Logger = require('../utils/logger');
const PlatformDetector = require('../utils/platformDetector');

class CRCONService {
    constructor(config) {
        this.config = config;
        this.token = null;
        this.sessionCookie = null;
        this.tokenExpiry = null;
        this.platformDetector = new PlatformDetector();
    }

    async authenticate() {
        if (this.config.apiToken) {
            this.token = this.config.apiToken;
            this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            return true;
        }

        if (!this.config.username || !this.config.password) {
            throw new Error('No CRCON authentication method available');
        }

        try {
            const response = await axios.post(`${this.config.baseUrl}/api/login`, {
                username: this.config.username,
                password: this.config.password
            }, {
                timeout: this.config.timeout || 10000,
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.headers['set-cookie']) {
                this.sessionCookie = response.headers['set-cookie'][0];
                this.tokenExpiry = new Date(Date.now() + 25 * 60 * 1000);
                Logger.info('✅ CRCON session authentication successful');
                return true;
            }
            
            throw new Error('No valid authentication response received');
            
        } catch (error) {
            Logger.error('❌ CRCON authentication failed:', error.message);
            throw error;
        }
    }

    async makeRequest(endpoint, method = 'GET', data = null) {
        if (!this.token && !this.sessionCookie) {
            await this.authenticate();
        }

        try {
            const config = {
                method,
                url: `${this.config.baseUrl}${endpoint}`,
                headers: { 'Content-Type': 'application/json' },
                timeout: this.config.timeout || 10000
            };

            if (this.config.apiToken) {
                config.headers['Authorization'] = `Bearer ${this.token}`;
            } else if (this.sessionCookie) {
                config.headers['Cookie'] = this.sessionCookie;
            }

            if (method === 'POST' && data) {
                config.data = data;
            }

            const response = await axios(config);
            
            if (response.data && typeof response.data === 'object' && 'result' in response.data) {
                return response.data.result;
            }
            
            return response.data;

        } catch (error) {
            if (error.response?.status === 401) {
                this.token = null;
                this.sessionCookie = null;
                this.tokenExpiry = null;
                await this.authenticate();
                return this.makeRequest(endpoint, method, data);
            }
            
            Logger.error(`CRCON API Error [${method} ${endpoint}]:`, error.message);
            throw error;
        }
    }

    async getPlayerByT17Username(t17Username) {
        try {
            const playerIds = await this.makeRequest('/api/get_playerids');
            
            if (playerIds && Array.isArray(playerIds)) {
                const exactMatch = playerIds.find(([name, steamId]) => 
                    name.toLowerCase() === t17Username.toLowerCase()
                );
                
                if (exactMatch) {
                    return {
                        name: exactMatch[0],
                        steam_id_64: exactMatch[1],
                        display_name: exactMatch[0]
                    };
                }
            }

            return null;

        } catch (error) {
            Logger.error('Error searching for player:', error.message);
            throw error;
        }
    }

    detectPlatform(playerData) {
        return this.platformDetector.detectPlatform(playerData);
    }

    async getVipStatus(steamId) {
        try {
            const vipIds = await this.makeRequest('/api/get_vip_ids');
            
            if (vipIds && Array.isArray(vipIds)) {
                const vipEntry = vipIds.find(vip => vip.player_id === steamId);
                
                if (vipEntry) {
                    if (vipEntry.expiration) {
                        const expirationDate = new Date(vipEntry.expiration);
                        const now = new Date();
                        const daysRemaining = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));

                        return {
                            isVip: daysRemaining > 0,
                            expirationDate: expirationDate.toLocaleDateString(),
                            daysRemaining: Math.max(0, daysRemaining),
                            description: vipEntry.description || 'VIP Player'
                        };
                    } else {
                        return {
                            isVip: true,
                            expirationDate: 'Never',
                            daysRemaining: null,
                            description: vipEntry.description || 'Permanent VIP'
                        };
                    }
                }
            }

            return { isVip: false };

        } catch (error) {
            Logger.error('Error fetching VIP status:', error.message);
            return { isVip: false };
        }
    }

    async testConnection() {
        try {
            const status = await this.makeRequest('/api/get_status');
            
            if (status) {
                return { 
                    connected: true, 
                    serverName: status.name || 'Unknown',
                    playerCount: status.player_count || 0,
                    maxPlayers: status.player_count_max || 0
                };
            }
            
            return { connected: false, error: 'No response from CRCON' };
        } catch (error) {
            return { 
                connected: false, 
                error: error.message 
            };
        }
    }

    async getServerName() {
        try {
            const status = await this.makeRequest('/api/get_status');
            return status?.name || 'Hell Let Loose Server';
        } catch (error) {
            return 'Hell Let Loose Server';
        }
    }

    async sendMessageToAllPlayers(message) {
        const messagingMethods = [
            () => this.makeRequest('/api/message_players', 'POST', { message: message, by: 'VIP Bot' }),
            () => this.makeRequest('/api/do_message_players', 'POST', { message: message, player_name: 'VIP Bot' }),
            () => this.makeRequest('/api/broadcast', 'POST', { message: message }),
            () => this.makeRequest('/api/do_broadcast', 'POST', { message: message })
        ];

        for (let i = 0; i < messagingMethods.length; i++) {
            try {
                const result = await messagingMethods[i]();
                Logger.info(`✅ Successfully sent in-game message using method ${i + 1}!`);
                return result;
            } catch (error) {
                Logger.warn(`❌ Method ${i + 1} failed:`, error.message);
                continue;
            }
        }
        
        throw new Error(`Failed to send in-game message after trying ${messagingMethods.length} different methods`);
    }

    async testMessaging() {
        try {
            await this.sendMessageToAllPlayers('🤖 VIP Bot test message - please ignore');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = CRCONService;
