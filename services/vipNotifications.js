const { EmbedBuilder } = require('discord.js');
const Logger = require('../utils/logger');
const { COLORS, EMOJIS, MESSAGES } = require('../config/constants');

class VIPNotificationService {
    constructor(database, crcon, client) {
        this.database = database;
        this.crcon = crcon;
        this.client = client;
        this.settings = {
            enabled: true,
            warningDays: [7, 3, 1],
            lastCheckTime: null,
            sentToday: {}
        };
        this.isRunning = false;
    }

    async start() {
        Logger.info('🔔 Starting VIP notification service...');
        this.isRunning = true;
    }

    async stop() {
        Logger.info('🔔 Stopping VIP notification service...');
        this.isRunning = false;
    }

    async getSettings() {
        return { ...this.settings };
    }

    async updateSettings(warningDays, enabled) {
        try {
            if (warningDays !== null) {
                const newWarningDays = [warningDays, Math.max(1, warningDays - 3), 1]
                    .filter((v, i, a) => a.indexOf(v) === i && v > 0)
                    .sort((a, b) => b - a);
                
                this.settings.warningDays = newWarningDays;
            }

            if (enabled !== null) {
                this.settings.enabled = enabled;
            }

            Logger.info(`VIP notification settings updated: enabled=${this.settings.enabled}, days=${this.settings.warningDays.join(',')}`);

        } catch (error) {
            Logger.error('Error updating VIP notification settings:', error);
            throw error;
        }
    }

    async checkExpirations() {
        if (!this.isRunning || !this.settings.enabled) {
            return;
        }

        try {
            Logger.info('🔔 Checking VIP expirations...');
            
            const vipPlayers = await this.crcon.makeRequest('/api/get_vip_ids');
            
            if (!vipPlayers || !Array.isArray(vipPlayers)) {
                Logger.warn('No VIP players found or invalid response from CRCON');
                return;
            }

            const now = new Date();
            const today = now.toDateString();
            let notificationsSent = 0;

            // Reset daily tracking if it's a new day
            if (this.settings.lastCheckTime) {
                const lastCheckDate = new Date(this.settings.lastCheckTime).toDateString();
                if (lastCheckDate !== today) {
                    this.settings.sentToday = {};
                }
            }

            for (const vip of vipPlayers) {
                try {
                    if (!vip.expiration || !vip.player_id) {
                        continue;
                    }

                    const expirationDate = new Date(vip.expiration);
                    const daysUntilExpiry = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));

                    // Skip if already expired
                    if (daysUntilExpiry < 0) {
                        continue;
                    }

                    // Check if we should send a notification
                    if (this.settings.warningDays.includes(daysUntilExpiry)) {
                        const notificationKey = `${vip.player_id}_${daysUntilExpiry}`;
                        
                        // Skip if already sent today
                        if (this.settings.sentToday[notificationKey]) {
                            continue;
                        }

                        // Find linked Discord user
                        const linkedPlayer = await this.database.getPlayerBySteamId(vip.player_id);
                        
                        if (linkedPlayer) {
                            const sent = await this.sendExpirationNotification(
                                linkedPlayer, 
                                vip, 
                                daysUntilExpiry, 
                                expirationDate
                            );

                            if (sent) {
                                this.settings.sentToday[notificationKey] = true;
                                notificationsSent++;
                            }
                        }
                    }

                } catch (error) {
                    Logger.error(`Error processing VIP ${vip.name || vip.player_id}:`, error);
                    continue;
                }
            }

            this.settings.lastCheckTime = now.toISOString();

            if (notificationsSent > 0) {
                Logger.info(`✅ Sent ${notificationsSent} VIP expiration notifications`);
            }

        } catch (error) {
            Logger.error('Error checking VIP expirations:', error);
        }
    }

    async sendExpirationNotification(linkedPlayer, vipData, daysRemaining, expirationDate) {
        try {
            const user = await this.client.users.fetch(linkedPlayer.discordId);
            
            if (!user) {
                Logger.warn(`Could not find Discord user for ${linkedPlayer.t17Username}`);
                return false;
            }

            const urgencyColor = this.getUrgencyColor(daysRemaining);
            const urgencyEmoji = this.getUrgencyEmoji(daysRemaining);
            const urgencyText = this.getUrgencyText(daysRemaining);
            
            const embed = new EmbedBuilder()
                .setColor(urgencyColor)
                .setTitle(`${urgencyEmoji} VIP Expiration Notice`)
                .setDescription(`Your VIP status is expiring ${urgencyText}!`)
                .addFields(
                    { name: '🎮 Player', value: linkedPlayer.t17Username, inline: true },
                    { name: '⏰ Expires', value: expirationDate.toLocaleDateString(), inline: true },
                    { name: '📅 Days Remaining', value: daysRemaining.toString(), inline: true }
                );

            if (daysRemaining <= 3) {
                embed.addFields({
                    name: '🔄 Renewal Required',
                    value: 'Contact a server administrator immediately to renew your VIP status.',
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '💡 Renewal Information',
                    value: 'Contact a server administrator to renew your VIP status before it expires.',
                    inline: false
                });
            }

            embed.setFooter({ 
                text: 'This is an automated reminder from the VIP system' 
            });
            embed.setTimestamp();

            await user.send({ embeds: [embed] });
            
            Logger.info(`VIP expiration notification sent to ${user.tag} (${linkedPlayer.t17Username}) - ${daysRemaining} days remaining`);
            return true;

        } catch (error) {
            Logger.error(`Failed to send VIP notification to ${linkedPlayer.discordId}:`, error.message);
            return false;
        }
    }

    getUrgencyColor(daysRemaining) {
        if (daysRemaining <= 1) return 0xFF0000;      // Red
        if (daysRemaining <= 3) return 0xFF8C00;      // Orange
        return 0xFFD700;                              // Gold
    }

    getUrgencyEmoji(daysRemaining) {
        if (daysRemaining <= 1) return '🚨';
        if (daysRemaining <= 3) return '⚠️';
        return '🔔';
    }

    getUrgencyText(daysRemaining) {
        if (daysRemaining <= 1) return 'very soon';
        if (daysRemaining <= 3) return 'soon';
        return 'in a few days';
    }

    async getNotificationStats() {
        try {
            const vipPlayers = await this.crcon.makeRequest('/api/get_vip_ids');
            const linkedPlayers = await this.database.getAllPlayers();
            
            if (!vipPlayers || !Array.isArray(vipPlayers)) {
                return null;
            }

            const now = new Date();
            const stats = {
                totalVipPlayers: vipPlayers.length,
                linkedVipPlayers: 0,
                expiringSoon: 0,
                expiringToday: 0,
                expired: 0,
                notificationsEnabled: this.settings.enabled,
                lastCheck: this.settings.lastCheckTime,
                warningDays: this.settings.warningDays
            };

            for (const vip of vipPlayers) {
                const isLinked = linkedPlayers.some(player => player.steamId === vip.player_id);
                if (isLinked) {
                    stats.linkedVipPlayers++;
                }

                if (vip.expiration) {
                    const expirationDate = new Date(vip.expiration);
                    const daysUntilExpiry = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));

                    if (daysUntilExpiry < 0) {
                        stats.expired++;
                    } else if (daysUntilExpiry === 0) {
                        stats.expiringToday++;
                    } else if (daysUntilExpiry <= 7) {
                        stats.expiringSoon++;
                    }
                }
            }

            return stats;

        } catch (error) {
            Logger.error('Error getting notification stats:', error);
            return null;
        }
    }

    async testNotification(discordId) {
        try {
            const user = await this.client.users.fetch(discordId);
            const linkedPlayer = await this.database.getPlayerByDiscordId(discordId);
            
            if (!linkedPlayer) {
                throw new Error('Player account not linked');
            }

            const embed = new EmbedBuilder()
                .setColor(0xFF8C00)
                .setTitle('🧪 Test VIP Notification')
                .setDescription('This is a test notification from the VIP system.')
                .addFields(
                    { name: '🎮 Player', value: linkedPlayer.t17Username, inline: true },
                    { name: '⏰ Test Time', value: new Date().toLocaleString(), inline: true }
                )
                .setFooter({ 
                    text: 'This is a test message - ignore if not requested' 
                });

            await user.send({ embeds: [embed] });
            Logger.info(`Test notification sent to ${user.tag}`);
            return true;

        } catch (error) {
            Logger.error('Error sending test notification:', error);
            return false;
        }
    }

    async save() {
        return true;
    }
}

module.exports = VIPNotificationService;
