const axios = require('axios');
const Logger = require('../utils/logger');
const PlatformDetector = require('../utils/platformDetector');

class CRCONService {
    constructor(config) {
        this.baseUrl = config.baseUrl;
        this.apiToken = config.apiToken;
        this.username = config.username;
        this.password = config.password;
        this.timeout = config.timeout || 10000;
        this.retryAttempts = 3;
        
        // Authentication state
        this.crconToken = null;
        this.sessionCookie = null;
        this.tokenExpiry = null;
        
        // Connection health
        this.lastSuccessfulRequest = null;
        this.consecutiveFailures = 0;
        this.isHealthy = false;
        
        this.platformDetector = new PlatformDetector();
    }

    /**
     * Validate CRCON configuration
     */
    validateConfig() {
        if (!this.baseUrl) {
            throw new Error('CRCON_BASE_URL is required');
        }
        if (!this.apiToken && (!this.username || !this.password)) {
            throw new Error('Either CRCON_API_TOKEN or CRCON_USERNAME/PASSWORD is required');
        }
        try {
            new URL(this.baseUrl);
        } catch {
            throw new Error('Invalid CRCON_BASE_URL format');
        }
    }

    /**
     * Authenticate with CRCON
     */
    async authenticate() {
        // Use API token if available
        if (this.apiToken) {
            this.crconToken = this.apiToken;
            this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
            Logger.info('✅ Using CRCON API token authentication');
            return true;
        }
        
        // Fallback to username/password
        if (!this.username || !this.password) {
            throw new Error('No CRCON authentication method available');
        }
        
        // Check if existing token is still valid
        if (this.crconToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
            return true;
        }
        
        try {
            const response = await axios.post(`${this.baseUrl}/api/login`, {
                username: this.username,
                password: this.password
            }, {
                timeout: this.timeout,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.headers['set-cookie']) {
                this.sessionCookie = response.headers['set-cookie'][0];
                this.tokenExpiry = new Date(Date.now() + 25 * 60 * 1000); // 25 minutes
                Logger.info('✅ CRCON session authentication successful');
                return true;
            } else if (response.data && response.data.access_token) {
                this.crconToken = response.data.access_token;
                this.tokenExpiry = new Date(Date.now() + 25 * 60 * 1000); // 25 minutes
                Logger.info('✅ CRCON JWT authentication successful');
                return true;
            }
            
            throw new Error('No valid authentication response received');
            
        } catch (error) {
            Logger.error('❌ CRCON authentication failed:', error.message);
            this.crconToken = null;
            this.sessionCookie = null;
            this.tokenExpiry = null;
            throw new Error(`CRCON authentication failed: ${error.message}`);
        }
    }

    /**
     * Make authenticated request to CRCON
     */
    async makeRequest(endpoint, method = 'GET', data = null, retryCount = 0) {
        // Ensure authentication
        if (!this.crconToken && !this.sessionCookie) {
            await this.authenticate();
        }
        
        try {
            const requestConfig = {
                method,
                url: `${this.baseUrl}${endpoint}`,
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: this.timeout
            };
            
            // Add authentication headers
            if (this.apiToken) {
                requestConfig.headers['Authorization'] = `Bearer ${this.crconToken}`;
            } else if (this.sessionCookie) {
                requestConfig.headers['Cookie'] = this.sessionCookie;
            } else if (this.crconToken) {
                requestConfig.headers['Authorization'] = `Bearer ${this.crconToken}`;
            }
            
            // Add request data
            if (method === 'POST' && data) {
                requestConfig.data = data;
            } else if (method === 'GET' && data) {
                const params = new URLSearchParams(data);
                requestConfig.url += `?${params.toString()}`;
            }
            
            Logger.debug(`Making CRCON request: ${method} ${endpoint}`);
            const response = await axios(requestConfig);
            
            // Update health status
            this.isHealthy = true;
            this.consecutiveFailures = 0;
            this.lastSuccessfulRequest = new Date();
            
            // Extract result from response
            if (response.data && typeof response.data === 'object' && 'result' in response.data) {
                return response.data.result;
            }
            
            return response.data;
            
        } catch (error) {
            this.consecutiveFailures++;
            this.isHealthy = this.consecutiveFailures < 3;
            
            // Handle authentication errors
            if (error.response?.status === 401 && !this.apiToken && retryCount === 0) {
                Logger.debug('Authentication expired, re-authenticating...');
                this.crconToken = null;
                this.sessionCookie = null;
                this.tokenExpiry = null;
                await this.authenticate();
                return this.makeRequest(endpoint, method, data, retryCount + 1);
            }
            
            // Retry on network errors
            if (retryCount < this.retryAttempts && this.isRetryableError(error)) {
                Logger.debug(`Retrying CRCON request (${retryCount + 1}/${this.retryAttempts}): ${endpoint}`);
                await this.delay(1000 * Math.pow(2, retryCount)); // Exponential backoff
                return this.makeRequest(endpoint, method, data, retryCount + 1);
            }
            
            Logger.error(`CRCON API Error [${method} ${endpoint}]:`, {
                status: error.response?.status,
                statusText: error.response?.statusText,
                message: error.message,
                retryCount
            });
            
            throw error;
        }
    }

    /**
     * Check if error is retryable
     */
    isRetryableError(error) {
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
            return true;
        }
        
        if (error.response) {
            const status = error.response.status;
            return status >= 500 || status === 429; // Server errors or rate limiting
        }
        
        return false;
    }

    /**
     * Delay helper for retries
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get player by T17 username - Multiple fallback methods
     */
    async getPlayerByT17Username(t17Username) {
        try {
            Logger.info(`🔍 Searching for player: ${t17Username}`);
            
            // Method 1: Try get_playerids (returns name, steam_id pairs)
            try {
                Logger.debug('Trying get_playerids endpoint...');
                const playerIds = await this.makeRequest('/api/get_playerids');
                
                if (playerIds && Array.isArray(playerIds)) {
                    const exactMatch = playerIds.find(([name, steamId]) => 
                        name && name.toLowerCase() === t17Username.toLowerCase()
                    );
                    
                    if (exactMatch) {
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
            
            // Method 2: Try current online players
            try {
                Logger.debug('Trying get_players endpoint...');
                const currentPlayers = await this.makeRequest('/api/get_players');
                
                if (currentPlayers && Array.isArray(currentPlayers)) {
                    const onlineMatch = currentPlayers.find(player => 
                        player && player.name && player.name.toLowerCase() === t17Username.toLowerCase()
                    );
                    
                    if (onlineMatch) {
                        Logger.info(`✅ Found player ${t17Username} via get_players (currently online)`);
                        return {
                            name: onlineMatch.name,
                            steam_id_64: onlineMatch.player_id || onlineMatch.steam_id_64,
                            display_name: onlineMatch.name
                        };
                    }
                }
            } catch (error) {
                Logger.debug('get_players failed:', error.message);
            }
            
            // Method 3: Try VIP list (guaranteed real players)
            try {
                Logger.debug('Trying get_vip_ids endpoint...');
                const vipIds = await this.makeRequest('/api/get_vip_ids');
                
                if (vipIds && Array.isArray(vipIds)) {
                    const vipMatch = vipIds.find(vip => 
                        vip && vip.name && vip.name.toLowerCase() === t17Username.toLowerCase()
                    );
                    
                    if (vipMatch) {
                        Logger.info(`✅ Found player ${t17Username} via get_vip_ids (VIP player)`);
                        return {
                            name: vipMatch.name,
                            steam_id_64: vipMatch.player_id,
                            display_name: vipMatch.name
                        };
                    }
                }
            } catch (error) {
                Logger.debug('get_vip_ids failed:', error.message);
            }
            
            // Method 4: Try detailed players
            try {
                Logger.debug('Trying get_detailed_players endpoint...');
                const detailedPlayers = await this.makeRequest('/api/get_detailed_players');
                
                let players = detailedPlayers;
                if (detailedPlayers && detailedPlayers.players && Array.isArray(detailedPlayers.players)) {
                    players = detailedPlayers.players;
                } else if (!Array.isArray(detailedPlayers)) {
                    players = [];
                }
                
                if (Array.isArray(players)) {
                    const playerMatch = players.find(player => 
                        player && player.name && player.name.toLowerCase() === t17Username.toLowerCase()
                    );
                    
                    if (playerMatch) {
                        Logger.info(`✅ Found player ${t17Username} via get_detailed_players`);
                        return {
                            name: playerMatch.name,
                            steam_id_64: playerMatch.steam_id_64 || playerMatch.player_id,
                            display_name: playerMatch.display_name || playerMatch.name
                        };
                    }
                }
            } catch (error) {
                Logger.debug('get_detailed_players failed:', error.message);
            }
            
            Logger.warn(`❌ Player ${t17Username} not found in any endpoint`);
            return null;
            
        } catch (error) {
            Logger.error('Error searching for player:', error.message);
            throw new Error('Failed to search for T17 username in CRCON');
        }
    }

    /**
     * Get VIP status for a player
     */
    async getVipStatus(steamId) {
        try {
            Logger.debug(`🔍 Checking VIP status for Steam ID: ${steamId}`);
            
            const vipIds = await this.makeRequest('/api/get_vip_ids');
            Logger.debug(`Found ${Array.isArray(vipIds) ? vipIds.length : 0} VIP entries`);
            
            if (vipIds && Array.isArray(vipIds)) {
                const vipEntry = vipIds.find(vip => {
                    if (!vip) return false;
                    
                    // Try different possible field names
                    const possibleIds = [vip.player_id, vip.steam_id_64, vip.steamId, vip.steam_id, vip.id];
                    return possibleIds.some(id => id && this.comparePlayerIds(id, steamId));
                });
                
                if (vipEntry) {
                    Logger.info(`✅ Found VIP entry for ${steamId}`);
                    
                    if (vipEntry.expiration && vipEntry.expiration !== 'None' && vipEntry.expiration !== null) {
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
            
            Logger.debug(`❌ No VIP entry found for ${steamId}`);
            return { isVip: false };
            
        } catch (error) {
            Logger.error('Error fetching VIP status:', error.message);
            return { isVip: false };
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

    detectPlatform(playerData) {
        return this.platformDetector.detectPlatform(playerData);
    }

    async testConnection() {
        try {
            const response = await this.makeRequest('/api/get_status');
            
            if (response) {
                this.isHealthy = true;
                this.consecutiveFailures = 0;
                this.lastSuccessfulRequest = new Date();
                
                return {
                    connected: true,
                    serverName: response.name || 'Unknown',
                    playerCount: response.player_count || 0,
                    maxPlayers: response.player_count_max || 0
                };
            }
            
            return { connected: false, error: 'No response from CRCON' };
        } catch (error) {
            this.isHealthy = false;
            this.consecutiveFailures++;
            
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

    /**
     * Send message to all online players
     */
    async sendMessageToAllPlayers(message) {
        try {
            Logger.debug(`🎯 Attempting to send message: "${message}"`);
            
            // Method 1: Try broadcast message
            try {
                await this.makeRequest('/api/set_broadcast', 'POST', {
                    message: message
                });
                
                Logger.info(`✅ Successfully sent broadcast message`);
                
                // Clear broadcast after 30 seconds
                setTimeout(async () => {
                    try {
                        await this.makeRequest('/api/set_broadcast', 'POST', {
                            message: ""
                        });
                    } catch (error) {
                        Logger.debug('Failed to clear broadcast:', error.message);
                    }
                }, 30000);
                
                return;
            } catch (error) {
                Logger.debug('Broadcast method failed:', error.message);
            }
            
            // Method 2: Try individual player messages
            try {
                const currentPlayers = await this.makeRequest('/api/get_players');
                
                if (currentPlayers && Array.isArray(currentPlayers) && currentPlayers.length > 0) {
                    Logger.info(`📨 Sending message to ${currentPlayers.length} online players`);
                    
                    for (const player of currentPlayers) {
                        try {
                            await this.makeRequest('/api/message_player', 'POST', {
                                player_name: player.name,
                                message: message,
                                by: 'VIP Bot',
                                save_message: false
                            });
                            await this.delay(100); // Small delay to avoid overwhelming CRCON
                        } catch (error) {
                            Logger.debug(`Failed to message player ${player.name}: ${error.message}`);
                        }
                    }
                    
                    Logger.info(`✅ Successfully sent individual messages`);
                    return;
                }
            } catch (error) {
                Logger.debug('Individual message method failed:', error.message);
            }
            
            throw new Error('All messaging methods failed');
            
        } catch (error) {
            Logger.error('Error sending message to all players:', error.message);
            throw error;
        }
    }

    async testMessaging() {
        try {
            await this.sendMessageToAllPlayers('🤖 VIP Bot test message - please ignore');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Debug methods for troubleshooting
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
                vipData: Array.isArray(vipList) ? vipList.slice(0, 5) : vipList,
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
            
            const endpoints = [
                { name: 'get_playerids', path: '/api/get_playerids' },
                { name: 'get_players', path: '/api/get_players' },
                { name: 'get_vip_ids', path: '/api/get_vip_ids' },
                { name: 'get_detailed_players', path: '/api/get_detailed_players' }
            ];

            for (const endpoint of endpoints) {
                try {
                    const data = await this.makeRequest(endpoint.path);
                    
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
