const COLORS = {
    SUCCESS: 0x00FF00,
    ERROR: 0xFF0000,
    WARNING: 0xFF8C00,
    INFO: 0x00D4FF,
    VIP_ACTIVE: 0xFFD700,
    VIP_EXPIRED: 0x808080
};

const EMOJIS = {
    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️',
    VIP: '🎖️',
    CONTEST: '🏆',
    GAME: '🎮'
};

const MESSAGES = {
    ERRORS: {
        ALREADY_LINKED: '❌ You\'re already linked to **{username}**. Use `/unlink` first if you want to change accounts.',
        USER_NOT_LINKED: '❌ That user hasn\'t linked their Hell Let Loose account yet.',
        USERNAME_NOT_FOUND: '❌ T17 username "{username}" not found in Hell Let Loose records.',
        ALREADY_LINKED_TO_ANOTHER: '❌ The T17 account "{username}" is already linked to another Discord user.',
        SERVER_UNAVAILABLE: '❌ Failed to connect to Hell Let Loose server. Please try again later.',
        ADMIN_REQUIRED: '❌ You need Administrator permissions to use this command.',
        RATE_LIMITED: '❌ You\'re doing that too fast! Please wait a moment and try again.',
        CONTEST_ACTIVE: '❌ There is already an active contest. End it first with `/contest end`.',
        UNKNOWN_COMMAND: '❌ Unknown command.'
    },
    INFO: {
        HOW_TO_FIND_USERNAME: '**How to find your T17 username:**\n• In-game: Check your profile or scoreboard\n• Console: It\'s your cross-platform username\n• PC: Usually your Steam name or custom T17 name',
        VIP_EXPIRING_SOON: '⚠️ VIP expiring soon! Contact an admin to renew.',
    }
};

module.exports = { COLORS, EMOJIS, MESSAGES };
