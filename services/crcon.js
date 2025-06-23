const axios = require('axios');
const Logger = require('../utils/logger');

class CRCONError extends Error {
    constructor(message, code = 'CRCON_ERROR') {
        super(message);
        this.name = 'CRCONError';
        this.code = code;
    }
}

class CRCONService {
    constructor(config) {
        this.config = config;
        this.token = null;
        this.sessionCookie = null;
        this.tokenExpiry = null;
        this.workingMessageMethod = null;
    }
}

module.exports = { CRCONService, CRCONError };
