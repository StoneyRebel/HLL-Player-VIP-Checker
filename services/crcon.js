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
            Logger.info('✅ Using API token authentication');
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

            Logger.debug(`Making CRCON request: ${method} ${endpoint}`);
            const response = await axios(config);
            
            if (response.data && typeof response.data === 'object' && 'result' in response.data) {
                return response.data.result;
            }
            
            return response.data;

        } catch (error) {
            if (error.response?.status === 401) {
                Logger.warn('401 Unauthorized, re-authenticating...');
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
            Logger.debug(`Searching for player: ${t17Username}`);
            
            const endpoints = [
                '/api/get_playerids',
                '/api/get_players',
                '/api/get_detailed_players'
            ];

            for (const endpoint of endpoints) {
                try {
                    const response = await this.makeRequest(endpoint);
                    Logger.debug(`Response from ${endpoint}:`, JSON.stringify(response, null, 2));
                    
                    let playerData = null;

                    if (endpoint === '/api/get_playerids') {
                        if (Array.isArray(response)) {
                            const exactMatch = response.find(([name, steamId]) => 
                                name.toLowerCase() === t17Username.toLowerCase()
                            );
                            
                            if (exactMatch) {
                                playerData = {
                                    name: exactMatch[0],
                                    steam_id_64: exactMatch[1],
                                    display_name: exactMatch[0]
                                };
                            }
                        }
                    } else if (endpoint === '/api/get_players') {
                        if (Array.isArray(response)) {
                            playerData = response.find(player => 
                                player.name && player.name.toLowerCase() === t17Username.toLowerCase()
                            );
                        }
                    } else if (endpoint === '/api/get_detailed_players') {
                        if (response && response.players && Array.isArray(response.players)) {
                            playerData = response.players.find(player => 
                                player.name && player.name.toLowerCase() === t17Username.toLowerCase()
                            );
                        }
                    }

                    if (playerData) {
                        Logger.info(`✅ Found player ${t17Username} via ${endpoint}`);
                        return {
                            name: playerData.name,
                            steam_id_64: playerData.steam_id_64 || playerData.player_id,
                            display_name: playerData.display_name || playerData.name
                        };
                    }

                } catch (endpointError) {
                    Logger.warn(`Endpoint ${endpoint} failed:`, endpointError.message);
                    continue;
                }
            }

            Logger.warn(`❌ Player ${t17Username} not found in any endpoint`);
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
            Logger.debug(`Checking VIP status for Steam ID: ${steamId}`);
            
            const vipIds = await this.makeRequest('/api/get_vip_ids');
            Logger.debug('VIP IDs response:', JSON.stringify(vipIds, null, 2));

            if (!vipIds) {
                Logger.warn('No VIP data received from CRCON');
                return { isVip: false };
            }

            if (!Array.isArray(vipIds)) {
                Logger.warn('VIP data is not an array:', typeof vipIds);
                return { isVip: false };
            }

            Logger.debug(`Found ${vipIds.length} VIP entries`);

            const vipEntry = vipIds.find(vip => {
                const vipPlayerId = vip.player_id || vip.steam_id_64 || vip.steamId;
                
                if (vipPlayerId === steamId) {
                    return true;
                }
                
                if (vipPlayerId && vipPlayerId.toLowerCase && steamId.toLowerCase &&
                    vipPlayerId.toLowerCase() === steamId.toLowerCase()) {
                    return true;
                }
                
                return false;
            });

            if (vipEntry) {
                Logger.info(`✅ Found VIP entry for ${steamId}`);
                Logger.debug('VIP entry:', JSON.stringify(vipEntry, null, 2));
                
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
            } else {
                Logger.debug(`❌ No VIP entry found for ${steamId}`);
                Logger.debug('Available VIP player IDs:', vipIds.map(vip => vip.player_id || vip.steam_id_64 || vip.steamId));
                return { isVip: false };
            }

        } catch (error) {
            Logger.error('Error fetching VIP status:', error.message);
            return { isVip: false, error: error.message };
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
        Logger.debug(`Attempting to send message: "${message}"`);
        
        const messagingMethods = [
            {
                name: 'set_broadcast',
                call: () => this.makeRequest('/api/set_broadcast', 'POST', { message: message })
            },
            {
                name: 'message_player (all)',
                call: () => this.makeRequest('/api/message_player', 'POST', { 
                    message: message, 
                    by: 'VIP Bot',
                    player_name: null,
                    player_id: null
                })
            }
        ];

        for (let i = 0; i < messagingMethods.length; i++) {
            const method = messagingMethods[i];
            try {
                Logger.debug(`Trying messaging method: ${method.name}`);
                const result = await method.call();
                Logger.info(`✅ Successfully sent in-game message using method: ${method.name}`);
                return result;
            } catch (error) {
                Logger.warn(`❌ Method "${method.name}" failed:`, error.message);
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

    async debugVipData(steamId) {
        try {
            Logger.info(`🔍 DEBUG: Checking VIP data for ${steamId}`);
            
            const vipIds = await this.makeRequest('/api/get_vip_ids');
            
            return {
                steamId: steamId,
                totalVipEntries: vipIds ? vipIds.length : 0,
                vipData: vipIds,
                matchingEntry: vipIds ? vipIds.find(vip => 
                    (vip.player_id && vip.player_id === steamId) ||
                    (vip.steam_id_64 && vip.steam_id_64 === steamId)
                ) : null
            };
            
        } catch (error) {
            Logger.error('Error in VIP debug:', error);
            return { error: error.message };
        }
    }
}

module.exports = CRCONService;
