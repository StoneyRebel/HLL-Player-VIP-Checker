const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Logger = require('../utils/logger');
const { COLORS, EMOJIS } = require('../config/constants');

class LeaderboardService {
    constructor(database, crcon, client) {
        this.database = database;
        this.crcon = crcon;
        this.client = client;
        this.leaderboardChannels = new Map();
        this.updateInProgress = false;
        this.lastUpdateTime = null;
    }

    async create(channel, type = 'kills') {
        try {
            Logger.info(`Creating leaderboard in channel ${channel.id} for type ${type}`);
            
            const embed = await this.generateLeaderboardEmbed(type, 'daily');
            const components = this.createLeaderboardButtons(type);

            const message = await channel.send({
                embeds: [embed],
                components: components
            });

            this.leaderboardChannels.set(channel.id, {
                messageId: message.id,
                channelId: channel.id,
                type: type,
                currentPeriod: 'daily',
                createdAt: new Date().toISOString(),
                lastUpdate: new Date().toISOString()
            });

            Logger.info(`Leaderboard created successfully in channel ${channel.id}`);
            return message;

        } catch (error) {
            Logger.error('Error creating leaderboard:', error);
            throw error;
        }
    }

    async updateAll() {
        if (this.updateInProgress) {
            Logger.debug('Leaderboard update already in progress, skipping');
            return;
        }

        this.updateInProgress = true;
        Logger.info('🔄 Updating all live leaderboards...');
        
        try {
            let updated = 0;
            let errors = 0;

            for (const [channelId, settings] of this.leaderboardChannels) {
                try {
                    const success = await this.updateLeaderboard(channelId, settings);
                    if (success) {
                        updated++;
                    } else {
                        errors++;
                    }
                } catch (error) {
                    Logger.error(`Error updating leaderboard in channel ${channelId}:`, error);
                    errors++;
                }
            }

            this.lastUpdateTime = new Date();
            Logger.info(`Leaderboard update complete: ${updated} updated, ${errors} errors`);

        } catch (error) {
            Logger.error('Error updating leaderboards:', error);
        } finally {
            this.updateInProgress = false;
        }
    }

    async updateLeaderboard(channelId, settings) {
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (!channel) {
                Logger.warn(`Channel ${channelId} not found, removing from leaderboards`);
                this.leaderboardChannels.delete(channelId);
                return false;
            }

            const message = await channel.messages.fetch(settings.messageId);
            if (!message) {
                Logger.warn(`Message ${settings.messageId} not found in channel ${channelId}`);
                this.leaderboardChannels.delete(channelId);
                return false;
            }

            const embed = await this.generateLeaderboardEmbed(settings.type, settings.currentPeriod);
            const components = this.createLeaderboardButtons(settings.type);

            await message.edit({
                embeds: [embed],
                components: components
            });

            settings.lastUpdate = new Date().toISOString();
            return true;

        } catch (error) {
            Logger.error(`Error updating leaderboard ${channelId}:`, error);
            return false;
        }
    }

    async generateLeaderboardEmbed(type, period) {
        try {
            const leaderboardData = await this.getLeaderboardData(type, period);
            const typeInfo = this.getLeaderboardTypeInfo(type);
            const serverName = await this.crcon.getServerName();

            const embed = new EmbedBuilder()
                .setColor(this.getPeriodColor(period))
                .setTitle(`🏆 ${typeInfo.name} Leaderboard`)
                .setDescription(`**${serverName}** • **${this.getPeriodLabel(period)}** • Top 20 Players`)
                .setTimestamp();

            if (leaderboardData.length === 0) {
                embed.addFields([
                    { name: '📊 No Data', value: 'No statistics available for this period yet.', inline: false }
                ]);
                return embed;
            }

            const top3 = leaderboardData.slice(0, 3);
            const next7 = leaderboardData.slice(3, 10);
            const final10 = leaderboardData.slice(10, 20);

            if (top3.length > 0) {
                const podiumText = top3.map((player, index) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    const value = this.formatStatValue(type, player.value);
                    return `${medals[index]} **${player.name}** • ${typeInfo.emoji} ${value}`;
                }).join('\n');

                embed.addFields([
                    { name: '🏆 **Top 3 Champions**', value: podiumText, inline: false }
                ]);
            }

            if (next7.length > 0) {
                const midTierText = next7.map((player, index) => {
                    const position = index + 4;
                    const value = this.formatStatValue(type, player.value);
                    return `\`${position.toString().padStart(2)}.\` ${player.name} • ${value}`;
                }).join('\n');

                embed.addFields([
                    { name: '🎯 **Elite Players (4-10)**', value: midTierText, inline: true }
                ]);
            }

            if (final10.length > 0) {
                const lowerTierText = final10.map((player, index) => {
                    const position = index + 11;
                    const value = this.formatStatValue(type, player.value);
                    return `\`${position.toString().padStart(2)}.\` ${player.name} • ${value}`;
                }).join('\n');

                embed.addFields([
                    { name: '⚔️ **Skilled Players (11-20)**', value: lowerTierText, inline: true }
                ]);
            }

            const totalPlayers = await this.database.getPlayerCount();
            const nextReset = this.getNextResetDate(period);
            
            embed.addFields([
                { name: '📊 **Statistics**', value: `👥 ${totalPlayers} linked players\n🔄 Next reset: ${nextReset}`, inline: false }
            ]);

            embed.setFooter({ 
                text: `Last updated: ${new Date().toLocaleString()} • Updates every hour` 
            });

            return embed;

        } catch (error) {
            Logger.error('Error generating leaderboard embed:', error);
            
            return new EmbedBuilder()
                .setColor(COLORS.ERROR)
                .setTitle('❌ Leaderboard Error')
                .setDescription('Failed to load leaderboard data. The server might be temporarily unavailable.')
                .setTimestamp();
        }
    }

    async getLeaderboardData(type, period) {
        try {
            const linkedPlayers = await this.database.getAllPlayers();
            const leaderboardData = [];

            for (const player of linkedPlayers) {
                try {
                    // For now, we'll use mock data since we don't have the full stats API
                    const stats = {
                        kills: Math.floor(Math.random() * 1000),
                        deaths: Math.floor(Math.random() * 800),
                        score: Math.floor(Math.random() * 50000),
                        playtime: Math.floor(Math.random() * 3600 * 100)
                    };

                    let value = 0;
                    switch (type) {
                        case 'kills':
                            value = stats.kills || 0;
                            break;
                        case 'score':
                            value = stats.score || 0;
                            break;
                        case 'playtime':
                            value = stats.playtime || 0;
                            break;
                        case 'kdr':
                            const kills = stats.kills || 0;
                            const deaths = stats.deaths || 0;
                            value = deaths > 0 ? kills / deaths : kills;
                            if (kills < 10) value = 0;
                            break;
                    }

                    if (value > 0) {
                        leaderboardData.push({
                            name: player.t17Username,
                            discordId: player.discordId,
                            steamId: player.steamId,
                            value: value
                        });
                    }

                } catch (error) {
                    Logger.warn(`Error getting stats for ${player.t17Username}:`, error.message);
                    continue;
                }
            }

            return leaderboardData
                .sort((a, b) => b.value - a.value)
                .slice(0, 20);

        } catch (error) {
            Logger.error('Error generating leaderboard data:', error);
            return [];
        }
    }

    createLeaderboardButtons(type) {
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`leaderboard_${type}_daily`)
                    .setLabel('📅 Daily')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`leaderboard_${type}_weekly`)
                    .setLabel('📆 Weekly')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`leaderboard_${type}_monthly`)
                    .setLabel('🗓️ Monthly')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`leaderboard_refresh_${type}`)
                    .setLabel('🔄 Refresh')
                    .setStyle(ButtonStyle.Secondary)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`leaderboard_kills`)
                    .setLabel('💀 Kills')
                    .setStyle(type === 'kills' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`leaderboard_score`)
                    .setLabel('🎯 Score')
                    .setStyle(type === 'score' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`leaderboard_playtime`)
                    .setLabel('⏱️ Time')
                    .setStyle(type === 'playtime' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`leaderboard_kdr`)
                    .setLabel('📈 K/D')
                    .setStyle(type === 'kdr' ? ButtonStyle.Success : ButtonStyle.Secondary)
            );

        return [row1, row2];
    }

    async handleButtonInteraction(interaction) {
        try {
            const customIdParts = interaction.customId.split('_');
            const [_, actionOrType, periodOrEmpty] = customIdParts;
            
            await interaction.deferUpdate();

            let newType = actionOrType;
            let newPeriod = periodOrEmpty || 'daily';

            if (['kills', 'score', 'playtime', 'kdr'].includes(actionOrType)) {
                newType = actionOrType;
                newPeriod = 'daily';
            } else if (['daily', 'weekly', 'monthly'].includes(periodOrEmpty)) {
                newType = actionOrType;
                newPeriod = periodOrEmpty;
            } else if (actionOrType === 'refresh') {
                newType = periodOrEmpty;
                newPeriod = 'daily';
            }

            const embed = await this.generateLeaderboardEmbed(newType, newPeriod);
            const components = this.createLeaderboardButtons(newType);

            await interaction.editReply({
                embeds: [embed],
                components: components
            });

            const currentSettings = this.leaderboardChannels.get(interaction.channel.id);
            if (currentSettings) {
                currentSettings.type = newType;
                currentSettings.currentPeriod = newPeriod;
                currentSettings.lastUpdate = new Date().toISOString();
            }

        } catch (error) {
            Logger.error('Error handling leaderboard button:', error);
            try {
                await interaction.followUp({
                    content: '❌ Failed to update leaderboard. Please try again.',
                    ephemeral: true
                });
            } catch (followUpError) {
                Logger.error('Error sending follow-up message:', followUpError);
            }
        }
    }

    getLeaderboardTypeInfo(type) {
        const types = {
            kills: { name: 'Most Kills', emoji: '💀' },
            score: { name: 'Highest Score', emoji: '🎯' },
            playtime: { name: 'Most Playtime', emoji: '⏱️' },
            kdr: { name: 'Best K/D Ratio', emoji: '📈' }
        };
        return types[type] || types.kills;
    }

    getPeriodColor(period) {
        const colors = {
            daily: 0x00FF00,
            weekly: 0x0099FF,
            monthly: 0xFF6600
        };
        return colors[period] || 0x00D4FF;
    }

    getPeriodLabel(period) {
        const labels = {
            daily: '📅 Today\'s Leaders',
            weekly: '📆 This Week\'s Leaders',
            monthly: '🗓️ This Month\'s Leaders'
        };
        return labels[period] || 'Leaderboard';
    }

    formatStatValue(type, value) {
        switch (type) {
            case 'kills':
            case 'score':
                return value.toLocaleString();
            case 'playtime':
                const hours = Math.floor(value / 3600);
                const minutes = Math.floor((value % 3600) / 60);
                return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
            case 'kdr':
                return value.toFixed(2);
            default:
                return value.toString();
        }
    }

    getNextResetDate(period) {
        const now = new Date();
        
        switch (period) {
            case 'daily':
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);
                return tomorrow.toLocaleDateString();
            case 'weekly':
                const nextMonday = new Date(now);
                const daysUntilMonday = (7 - now.getDay() + 1) % 7;
                nextMonday.setDate(now.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday));
                nextMonday.setHours(0, 0, 0, 0);
                return nextMonday.toLocaleDateString();
            case 'monthly':
                const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                return nextMonth.toLocaleDateString();
            default:
                return 'Unknown';
        }
    }

    async save() {
        return true;
    }
}

module.exports = LeaderboardService;
