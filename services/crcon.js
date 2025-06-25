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
            
            // Handle different response formats
            if (response.data && typeof response.data === 'object' && 'result' in response.data) {
                Logger.debug(`API response has 'result' wrapper`);
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
            Logger.info(`🔍 Searching for player: ${t17Username}`);
            
            // Method 1: Try get_player_info (most direct)
            try {
                Logger.debug('Trying get_player_info endpoint...');
                const playerInfo = await this.makeRequest('/api/get_player_info', 'GET', { 
                    player_name: t17Username 
                });
                
                if (playerInfo && playerInfo.steam_id_64) {
                    Logger.info(`✅ Found player ${t17Username} via get_player_info`);
                    return {
                        name: playerInfo.name || t17Username,
                        steam_id_64: playerInfo.steam_id_64,
                        display_name: playerInfo.display_name || playerInfo.name || t17Username
                    };
                }
            } catch (error) {
                Logger.debug('get_player_info failed:', error.message);
            }

            // Method 2: Try get_playerids with as_dict=false (returns tuples)
            try {
                Logger.debug('Trying get_playerids endpoint...');
                const playerIds = await this.makeRequest('/api/get_playerids?as_dict=false');
                Logger.debug(`get_playerids returned ${Array.isArray(playerIds) ? playerIds.length : 'non-array'} entries`);
                
                if (playerIds && Array.isArray(playerIds)) {
                    const exactMatch = playerIds.find(([name, steamId]) => 
                        name && name.toLowerCase() === t17Username.toLowerCase()
                    );
                    
                    if (exactMatch && exactMatch[1]) {
                        Logger.info(`✅ Found player ${t17Username} via get_playerids`);
                        return {
                            name: exactMatch[0],
                            steam_id_64: exactMatch[1],
                            display_name: exactMatch[0]
                        };
                    }
                }
            } catch (error) {
                Logger.debug('get_playerids failed:', error.message);
            }

            // Method 3: Try get_playerids with as_dict=true (returns object)
            try {
                Logger.debug('Trying get_playerids with as_dict=true...');
                const playerDict = await this.makeRequest('/api/get_playerids?as_dict=true');
                
                if (playerDict && typeof playerDict === 'object') {
                    // Search through the dictionary
                    for (const [name, steamId] of Object.entries(playerDict)) {
                        if (name && name.toLowerCase() === t17Username.toLowerCase()) {
                            Logger.info(`✅ Found player ${t17Username} via get_playerids (dict)`);
                            return {
                                name: name,
                                steam_id_64: steamId,
                                display_name: name
                            };
                        }
                    }
                }
            } catch (error) {
                Logger.debug('get_playerids (dict) failed:', error.message);
            }

            // Method 4: Try get_detailed_players
            try {
                Logger.debug('Trying get_detailed_players endpoint...');
                const detailedPlayers = await this.makeRequest('/api/get_detailed_players');
                
                if (detailedPlayers) {
                    let players = detailedPlayers;
                    
                    // Handle different response formats
                    if (detailedPlayers.players && Array.isArray(detailedPlayers.players)) {
                        players = detailedPlayers.players;
                    } else if (detailedPlayers.result && Array.isArray(detailedPlayers.result)) {
                        players = detailedPlayers.result;
                    } else if (!Array.isArray(detailedPlayers)) {
                        Logger.debug('Unexpected detailed players format:', typeof detailedPlayers);
                        players = [];
                    }

                    if (Array.isArray(players)) {
                        const playerMatch = players.find(player => 
                            player && player.name && 
                            player.name.toLowerCase() === t17Username.toLowerCase()
                        );
                        
                        if (playerMatch && (playerMatch.steam_id_64 || playerMatch.player_id)) {
                            Logger.info(`✅ Found player ${t17Username} via get_detailed_players`);
                            return {
                                name: playerMatch.name,
                                steam_id_64: playerMatch.steam_id_64 || playerMatch.player_id,
                                display_name: playerMatch.display_name || playerMatch.name
                            };
                        }
                    }
                }
            } catch (error) {
                Logger.debug('get_detailed_players failed:', error.message);
            }

            // Method 5: Try get_players (current players only)
            try {
                Logger.debug('Trying get_players endpoint...');
                const currentPlayers = await this.makeRequest('/api/get_players');
                
                if (currentPlayers && Array.isArray(currentPlayers)) {
                    const playerMatch = currentPlayers.find(player => 
                        player && player.name && 
                        player.name.toLowerCase() === t17Username.toLowerCase()
                    );
                    
                    if (playerMatch && (playerMatch.steam_id_64 || playerMatch.player_id)) {
                        Logger.info(`✅ Found player ${t17Username} via get_players (currently online)`);
                        return {
                            name: playerMatch.name,
                            steam_id_64: playerMatch.steam_id_64 || playerMatch.player_id,
                            display_name: playerMatch.display_name || playerMatch.name
                        };
                    }
                }
            } catch (error) {
                Logger.debug('get_players failed:', error.message);
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
            Logger.debug(`🔍 Checking VIP status for Steam ID: ${steamId}`);
            
            const vipData = await this.makeRequest('/api/get_vip_ids');
            Logger.debug('Raw VIP data response:', JSON.stringify(vipData, null, 2));

            if (!vipData) {
                Logger.warn('No VIP data received from CRCON');
                return { isVip: false };
            }

            let vipList = vipData;
            
            // Handle different response formats
            if (vipData.result && Array.isArray(vipData.result)) {
                vipList = vipData.result;
            } else if (!Array.isArray(vipData)) {
                Logger.warn('VIP data is not an array:', typeof vipData);
                Logger.debug('VIP data structure:', JSON.stringify(vipData, null, 2));
                return { isVip: false };
            }

            Logger.debug(`Found ${vipList.length} VIP entries to check`);

            // Log sample VIP entry structure for debugging
            if (vipList.length > 0) {
                Logger.debug('Sample VIP entry structure:', JSON.stringify(vipList[0], null, 2));
            }

            // Try different possible field names for player identification
            const possiblePlayerFields = ['player_id', 'steam_id_64', 'steamId', 'steam_id', 'id'];
            
            const vipEntry = vipList.find(vip => {
                if (!vip || typeof vip !== 'object') return false;
                
                for (const field of possiblePlayerFields) {
                    const vipPlayerId = vip[field];
                    if (vipPlayerId && this.comparePlayerIds(vipPlayerId, steamId)) {
                        Logger.debug(`Matched VIP entry using field: ${field}`);
                        return true;
                    }
                }
                return false;
            });

            if (vipEntry) {
                Logger.info(`✅ Found VIP entry for ${steamId}`);
                Logger.debug('VIP entry details:', JSON.stringify(vipEntry, null, 2));
                
                // Try different possible field names for expiration
                const possibleExpirationFields = ['expiration', 'expires_at', 'expire_date', 'expiry'];
                let expiration = null;
                
                for (const field of possibleExpirationFields) {
                    if (vipEntry[field]) {
                        expiration = vipEntry[field];
                        Logger.debug(`Found expiration using field: ${field} = ${expiration}`);
                        break;
                    }
                }

                if (expiration && expiration !== 'None' && expiration !== null) {
                    const expirationDate = new Date(expiration);
                    const now = new Date();
                    const daysRemaining = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));

                    return {
                        isVip: daysRemaining > 0,
                        expirationDate: expirationDate.toLocaleDateString(),
                        daysRemaining: Math.max(0, daysRemaining),
                        description: vipEntry.description || vipEntry.reason || 'VIP Player'
                    };
                } else {
                    return {
                        isVip: true,
                        expirationDate: 'Never',
                        daysRemaining: null,
                        description: vipEntry.description || vipEntry.reason || 'Permanent VIP'
                    };
                }
            } else {
                Logger.debug(`❌ No VIP entry found for ${steamId}`);
                
                // Debug: Show available player IDs
                const availableIds = vipList.map(vip => {
                    const ids = {};
                    possiblePlayerFields.forEach(field => {
                        if (vip[field]) ids[field] = vip[field];
                    });
                    return ids;
                }).slice(0, 5); // Show first 5 for debugging
                
                Logger.debug('Sample available VIP player IDs:', JSON.stringify(availableIds, null, 2));
                return { isVip: false };
            }

        } catch (error) {
            Logger.error('Error fetching VIP status:', error.message);
            return { isVip: false, error: error.message };
        }
    }

    comparePlayerIds(id1, id2) {
        if (!id1 || !id2) return false;
        
        // Direct comparison
        if (id1 === id2) return true;
        
        // Case-insensitive comparison for strings
        if (typeof id1 === 'string' && typeof id2 === 'string') {
            return id1.toLowerCase() === id2.toLowerCase();
        }
        
        // Convert to strings and compare
        return String(id1) === String(id2);
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
        Logger.debug(`🎯 Attempting to send message: "${message}"`);
        
        // Try different messaging methods based on the API documentation
        const messagingMethods = [
            {
                name: 'set_broadcast',
                call: () => this.makeRequest('/api/set_broadcast', 'POST', { message: message })
            },
            {
                name: 'message_player (broadcast)',
                call: () => this.makeRequest('/api/message_player', 'POST', { 
                    message: message, 
                    by: 'VIP Bot'
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
            
            const vipData = await this.makeRequest('/api/get_vip_ids');
            
            let vipList = vipData;
            if (vipData && vipData.result && Array.isArray(vipData.result)) {
                vipList = vipData.result;
            }
            
            const possiblePlayerFields = ['player_id', 'steam_id_64', 'steamId', 'steam_id', 'id'];
            
            let matchingEntry = null;
            if (Array.isArray(vipList)) {
                matchingEntry = vipList.find(vip => {
                    if (!vip || typeof vip !== 'object') return false;
                    
                    for (const field of possiblePlayerFields) {
                        const vipPlayerId = vip[field];
                        if (vipPlayerId && this.comparePlayerIds(vipPlayerId, steamId)) {
                            return true;
                        }
                    }
                    return false;
                });
            }
            
            return {
                steamId: steamId,
                totalVipEntries: Array.isArray(vipList) ? vipList.length : 0,
                vipData: Array.isArray(vipList) ? vipList.slice(0, 5) : vipList, // Limit to first 5 for debugging
                matchingEntry: matchingEntry,
                responseFormat: {
                    isArray: Array.isArray(vipData),
                    hasResult: vipData && 'result' in vipData,
                    type: typeof vipData
                }
            };
            
        } catch (error) {
            Logger.error('Error in VIP debug:', error);
            return { error: error.message };
        }
    }

    async debugPlayerSearch(t17Username) {
        try {
            Logger.info(`🔍 DEBUG: Searching for player ${t17Username} across all endpoints`);
            
            const results = {};
            
            // Test each endpoint individually
            const endpoints = [
                { name: 'get_player_info', path: '/api/get_player_info', params: { player_name: t17Username } },
                { name: 'get_playerids', path: '/api/get_playerids' },
                { name: 'get_playerids_dict', path: '/api/get_playerids?as_dict=true' },
                { name: 'get_players', path: '/api/get_players' },
                { name: 'get_detailed_players', path: '/api/get_detailed_players' }
            ];

            for (const endpoint of endpoints) {
                try {
                    const data = endpoint.params 
                        ? await this.makeRequest(endpoint.path, 'GET', endpoint.params)
                        : await this.makeRequest(endpoint.path);
                    
                    results[endpoint.name] = {
                        success: true,
                        dataType: typeof data,
                        isArray: Array.isArray(data),
                        count: Array.isArray(data) ? data.length : (data && typeof data === 'object' ? Object.keys(data).length : 0),
                        sample: Array.isArray(data) ? data.slice(0, 2) : data
                    };
                } catch (error) {
                    results[endpoint.name] = {
                        success: false,
                        error: error.message
                    };
                }
            }
            
            return {
                searchTerm: t17Username,
                endpointResults: results
            };
            
        } catch (error) {
            Logger.error('Error in player search debug:', error);
            return { error: error.message };
        }
    }
}

module.exports = CRCONService;
