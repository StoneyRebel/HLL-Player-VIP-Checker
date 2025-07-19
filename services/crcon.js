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
        
        this.crconToken = null;
        this.sessionCookie = null;
        this.tokenExpiry = null;
        this.lastSuccessfulRequest = null;
        this.consecutiveFailures = 0;
        this.isHealthy = false;
        
        this.platformDetector = new PlatformDetector();
    }

    async authenticate() {
        if (this.apiToken) {
            this.crconToken = this.apiToken;
            this.tokenExpiry = null;
            Logger.info('✅ Using CRCON API token authentication');
            return true;
        }
        
        if (!this.username || !this.password) {
            throw new Error('No CRCON authentication method available');
        }
        
        if (this.crconToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
            return true;
        }
        
        try {
            const response = await axios.post(`${this.baseUrl}/api/login`, {
                username: this.username,
                password: this.password
            }, {
                timeout: this.timeout,
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.headers['set-cookie']) {
                this.sessionCookie = response.headers['set-cookie'][0];
                this.tokenExpiry = new Date(Date.now() + 25 * 60 * 1000);
                Logger.info('✅ CRCON session authentication successful');
                return true;
            } else if (response.data && response.data.access_token) {
                this.crconToken = response.data.access_token;
                this.tokenExpiry = new Date(Date.now() + 25 * 60 * 1000);
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

    async makeRequest(endpoint, method = 'GET', data = null, retryCount = 0) {
        if (!this.crconToken && !this.sessionCookie) {
            await this.authenticate();
        }
        
        try {
            const requestConfig = {
                method,
                url: `${this.baseUrl}${endpoint}`,
                headers: { 'Content-Type': 'application/json' },
                timeout: this.timeout
            };
            
            if (this.sessionCookie) {
                requestConfig.headers['Cookie'] = this.sessionCookie;
            } else if (this.crconToken) {
                requestConfig.headers['Authorization'] = `Bearer ${this.crconToken}`;
            }
            
            if (method === 'POST' && data) {
                requestConfig.data = data;
            } else if (method === 'GET' && data) {
                const params = new URLSearchParams(data);
                requestConfig.url += `?${params.toString()}`;
            }
            
            const response = await axios(requestConfig);
            this.isHealthy = true;
            this.consecutiveFailures = 0;
            this.lastSuccessfulRequest = new Date();
            
            if (response.data && typeof response.data === 'object' && 'result' in response.data) {
                return response.data.result;
            }
            
            return response.data;
            
        } catch (error) {
            this.consecutiveFailures++;
            this.isHealthy = this.consecutiveFailures < 3;
            
            if (error.response?.status === 401 && !this.apiToken && retryCount === 0) {
                this.crconToken = null;
                this.sessionCookie = null;
                this.tokenExpiry = null;
                await this.authenticate();
                return this.makeRequest(endpoint, method, data, retryCount + 1);
            }
            
            if (retryCount < this.retryAttempts && this.isRetryableError(error)) {
                await this.delay(1000 * Math.pow(2, retryCount));
                return this.makeRequest(endpoint, method, data, retryCount + 1);
            }
            
            throw error;
        }
    }

    isRetryableError(error) {
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;
        if (error.response) {
            const status = error.response.status;
            return status >= 500 || status === 429;
        }
        return false;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * ENHANCED: Comprehensive player search across ALL 8 endpoints
     */
    async getPlayerByT17Username(t17Username) {
        try {
            Logger.info(`🔍 Comprehensive search for: ${t17Username}`);
            
            const searchStrategies = [
                { name: 'get_players', endpoint: '/api/get_players', parser: this.parseCurrentPlayers },
                { name: 'get_detailed_players', endpoint: '/api/get_detailed_players', parser: this.parseDetailedPlayers },
                { name: 'get_playerids', endpoint: '/api/get_playerids', parser: this.parsePlayerIds },
                { name: 'get_vip_ids', endpoint: '/api/get_vip_ids', parser: this.parseVipIds },
                { name: 'get_admin_ids', endpoint: '/api/get_admin_ids', parser: this.parseAdminIds },
                { name: 'get_player_info', endpoint: `/api/get_player_info?player_name=${encodeURIComponent(t17Username)}&can_fail=true`, parser: this.parsePlayerInfo },
                { name: 'get_detailed_player_info', endpoint: `/api/get_detailed_player_info?player_name=${encodeURIComponent(t17Username)}`, parser: this.parseDetailedPlayerInfo },
                { name: 'get_players_history', endpoint: '/api/get_players_history', method: 'POST', data: { player_name: t17Username, exact_name_match: true, page_size: 50, page: 1 }, parser: this.parsePlayersHistory }
            ];

            for (const strategy of searchStrategies) {
                try {
                    Logger.debug(`Trying ${strategy.name}...`);
                    const data = await this.makeRequest(strategy.endpoint, strategy.method || 'GET', strategy.data || null);
                    const player = strategy.parser.call(this, data, t17Username);
                    
                    if (player) {
                        Logger.info(`✅ Found ${t17Username} via ${strategy.name}`);
                        return player;
                    }
                } catch (error) {
                    Logger.debug(`${strategy.name} failed: ${error.message}`);
                    continue;
                }
            }

            Logger.warn(`❌ Player ${t17Username} not found in ANY endpoint`);
            return null;
            
        } catch (error) {
            Logger.error('Error in comprehensive player search:', error);
            throw error;
        }
    }

    parseCurrentPlayers(data, username) {
        if (!Array.isArray(data)) return null;
        const match = data.find(p => p?.name?.toLowerCase() === username.toLowerCase());
        return match ? { name: match.name, steam_id_64: match.player_id || match.steam_id_64, display_name: match.name } : null;
    }

    parseDetailedPlayers(data, username) {
        const players = data?.players || data;
        if (!Array.isArray(players)) return null;
        const match = players.find(p => p?.name?.toLowerCase() === username.toLowerCase());
        return match ? { name: match.name, steam_id_64: match.steam_id_64 || match.player_id, display_name: match.display_name || match.name } : null;
    }

    parsePlayerIds(data, username) {
        if (!Array.isArray(data)) return null;
        const match = data.find(([name, steamId]) => name && name.toLowerCase() === username.toLowerCase());
        return match ? { name: match[0], steam_id_64: match[1], display_name: match[0] } : null;
    }

    parseVipIds(data, username) {
        if (!Array.isArray(data)) return null;
        const match = data.find(vip => vip?.name?.toLowerCase() === username.toLowerCase());
        return match ? { name: match.name, steam_id_64: match.player_id, display_name: match.name } : null;
    }

    parseAdminIds(data, username) {
        if (!Array.isArray(data)) return null;
        const match = data.find(admin => admin?.name?.toLowerCase() === username.toLowerCase());
        return match ? { name: match.name, steam_id_64: match.player_id || match.steam_id_64, display_name: match.name } : null;
    }

    parsePlayersHistory(data, username) {
        const results = data?.results || data?.players || data;
        if (!Array.isArray(results)) return null;
        
        const match = results.find(p => {
            if (p?.name?.toLowerCase() === username.toLowerCase()) return true;
            if (p?.names && Array.isArray(p.names)) {
                return p.names.some(nameObj => nameObj?.name?.toLowerCase() === username.toLowerCase());
            }
            return false;
        });
        
        if (match) {
            let foundName = username;
            if (match.names && Array.isArray(match.names)) {
                const nameObj = match.names.find(n => n.name?.toLowerCase() === username.toLowerCase());
                if (nameObj) foundName = nameObj.name;
            } else if (match.name) {
                foundName = match.name;
            }
            
            return { name: foundName, steam_id_64: match.steam_id_64, display_name: foundName };
        }
        return null;
    }

    parsePlayerInfo(data, username) {
        if (!data || !data.name) return null;
        return { name: data.name, steam_id_64: data.steam_id_64 || data.player_id, display_name: data.name };
    }

    parseDetailedPlayerInfo(data, username) {
        if (!data || !data.player) return null;
        const player = data.player;
        return { name: player.name, steam_id_64: player.steam_id_64, display_name: player.display_name || player.name };
    }

    detectPlatform(playerData) {
        return this.platformDetector.detectPlatform(playerData);
    }

    async getVipStatus(steamId) {
        try {
            const vipIds = await this.makeRequest('/api/get_vip_ids');
            
            if (vipIds && Array.isArray(vipIds)) {
                const vipEntry = vipIds.find(vip => {
                    if (!vip) return false;
                    const possibleIds = [vip.player_id, vip.steam_id_64, vip.steamId, vip.steam_id, vip.id];
                    return possibleIds.some(id => id && this.comparePlayerIds(id, steamId));
                });
                
                if (vipEntry) {
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
            
            return { isVip: false };
            
        } catch (error) {
            Logger.error('Error fetching VIP status:', error.message);
            return { isVip: false };
        }
    }

    comparePlayerIds(id1, id2) {
        if (!id1 || !id2) return false;
        if (id1 === id2) return true;
        if (typeof id1 === 'string' && typeof id2 === 'string') {
            return id1.toLowerCase() === id2.toLowerCase();
        }
        return String(id1) === String(id2);
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
            return { connected: false, error: error.message };
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
        try {
            try {
                await this.makeRequest('/api/set_broadcast', 'POST', { message: message });
                setTimeout(async () => {
                    try {
                        await this.makeRequest('/api/set_broadcast', 'POST', { message: "" });
                    } catch (error) {
                        Logger.debug('Failed to clear broadcast:', error.message);
                    }
                }, 30000);
                return;
            } catch (error) {
                Logger.debug('Broadcast method failed:', error.message);
            }
            
            const currentPlayers = await this.makeRequest('/api/get_players');
            if (currentPlayers && Array.isArray(currentPlayers) && currentPlayers.length > 0) {
                for (const player of currentPlayers) {
                    try {
                        await this.makeRequest('/api/message_player', 'POST', {
                            player_name: player.name,
                            message: message,
                            by: 'VIP Bot',
                            save_message: false
                        });
                        await this.delay(100);
                    } catch (error) {
                        Logger.debug(`Failed to message player ${player.name}: ${error.message}`);
                    }
                }
                return;
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
}

module.exports = CRCONService;

    async debugPlayerSearch(t17Username) {
        try {
            Logger.info(`🔍 DEBUG: Comprehensive search for ${t17Username} across all endpoints`);
            
            const results = {};
            const endpoints = [
                { name: 'get_playerids', path: '/api/get_playerids' },
                { name: 'get_players', path: '/api/get_players' },
                { name: 'get_vip_ids', path: '/api/get_vip_ids' },
                { name: 'get_detailed_players', path: '/api/get_detailed_players' },
                { name: 'get_admin_ids', path: '/api/get_admin_ids' },
                { name: 'get_player_info', path: `/api/get_player_info?player_name=${encodeURIComponent(t17Username)}` },
                { name: 'get_detailed_player_info', path: `/api/get_detailed_player_info?player_name=${encodeURIComponent(t17Username)}` },
                { name: 'get_players_history', path: '/api/get_players_history', method: 'POST', data: { player_name: t17Username, exact_name_match: true, page_size: 10 } }
            ];

            for (const endpoint of endpoints) {
                try {
                    const data = await this.makeRequest(endpoint.path, endpoint.method || 'GET', endpoint.data || null);
                    
                    results[endpoint.name] = {
                        success: true,
                        dataType: typeof data,
                        isArray: Array.isArray(data),
                        count: Array.isArray(data) ? data.length : (data && typeof data === 'object' ? Object.keys(data).length : 0),
                        foundPlayer: this.testParseForUsername(data, t17Username, endpoint.name)
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
            Logger.error('Error in comprehensive player search debug:', error);
            return { error: error.message };
        }
    }

    testParseForUsername(data, username, endpointName) {
        try {
            switch (endpointName) {
                case 'get_players':
                    return this.parseCurrentPlayers(data, username);
                case 'get_detailed_players':
                    return this.parseDetailedPlayers(data, username);
                case 'get_playerids':
                    return this.parsePlayerIds(data, username);
                case 'get_vip_ids':
                    return this.parseVipIds(data, username);
                case 'get_admin_ids':
                    return this.parseAdminIds(data, username);
                case 'get_players_history':
                    return this.parsePlayersHistory(data, username);
                case 'get_player_info':
                    return this.parsePlayerInfo(data, username);
                case 'get_detailed_player_info':
                    return this.parseDetailedPlayerInfo(data, username);
                default:
                    return null;
            }
        } catch (error) {
            return { error: error.message };
        }
    }
