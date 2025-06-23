class PlatformDetector {
    detectPlatform(playerData) {
        if (!playerData.steam_id_64) {
            return '🎮 Console';
        }
        
        const steamId = playerData.steam_id_64;
        const t17Username = playerData.name ? playerData.name.toLowerCase() : '';
        
        if (steamId.startsWith('11000') || steamId.startsWith('76561199')) {
            return '🎮 PlayStation';
        }
        
        if (t17Username.includes('xbox') || t17Username.includes('xbl')) {
            return '🎮 Xbox';
        }
        
        if (steamId.startsWith('76561198')) {
            if (t17Username.match(/^[a-z]+\d+$/) && t17Username.length > 15) {
                return '🎮 Xbox';
            }
            return '💻 PC/Steam';
        }
        
        return '🎮 Console';
    }
}

module.exports = PlatformDetector;
