class EnvironmentConfig {
    constructor() {
        this.validateRequired();
    }

    validateRequired() {
        const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        if (!process.env.CRCON_API_TOKEN && 
            (!process.env.CRCON_USERNAME || !process.env.CRCON_PASSWORD)) {
            throw new Error('Missing CRCON authentication credentials');
        }
    }

    get discord() {
        return {
            token: process.env.DISCORD_TOKEN,
            clientId: process.env.DISCORD_CLIENT_ID
        };
    }

    get crcon() {
        return {
            baseUrl: process.env.CRCON_BASE_URL || 'http://localhost:8010',
            apiToken: process.env.CRCON_API_TOKEN,
            username: process.env.CRCON_USERNAME,
            password: process.env.CRCON_PASSWORD,
            timeout: parseInt(process.env.CRCON_TIMEOUT) || 10000
        };
    }

    get database() {
        return {
            filename: process.env.DB_FILENAME || './data/database.sqlite'
        };
    }
}

module.exports = new EnvironmentConfig();
