class RateLimiter {
    constructor() {
        this.userRequests = new Map();
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    checkUserLimit(userId, limit = 10, windowMs = 60000) {
        const now = Date.now();
        const userKey = `user_${userId}`;
        
        if (!this.userRequests.has(userKey)) {
            this.userRequests.set(userKey, { count: 1, resetTime: now + windowMs });
            return true;
        }

        const userData = this.userRequests.get(userKey);
        
        if (now > userData.resetTime) {
            userData.count = 1;
            userData.resetTime = now + windowMs;
            return true;
        }

        if (userData.count >= limit) {
            return false;
        }

        userData.count++;
        return true;
    }

    cleanup() {
        const now = Date.now();
        for (const [key, data] of this.userRequests.entries()) {
            if (now > data.resetTime) {
                this.userRequests.delete(key);
            }
        }
    }
}

module.exports = RateLimiter;
