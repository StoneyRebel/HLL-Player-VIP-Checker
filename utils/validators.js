class ValidationError extends Error {
    constructor(message, field = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
    }
}

class Validators {
    static validateT17Username(username) {
        if (!username || typeof username !== 'string') {
            throw new ValidationError('T17 username is required');
        }

        const trimmed = username.trim();
        
        if (trimmed.length < 2 || trimmed.length > 50) {
            throw new ValidationError('T17 username must be between 2 and 50 characters');
        }

        return trimmed;
    }

    static validateContestTitle(title) {
        if (!title || typeof title !== 'string') {
            throw new ValidationError('Contest title is required');
        }

        const trimmed = title.trim();
        
        if (trimmed.length < 3 || trimmed.length > 100) {
            throw new ValidationError('Contest title must be between 3 and 100 characters');
        }

        return trimmed;
    }

    static validateContestDescription(description) {
        if (!description || typeof description !== 'string') {
            throw new ValidationError('Contest description is required');
        }

        const trimmed = description.trim();
        
        if (trimmed.length < 10 || trimmed.length > 500) {
            throw new ValidationError('Contest description must be between 10 and 500 characters');
        }

        return trimmed;
    }
}

module.exports = { Validators, ValidationError };
