const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const Logger = require('../utils/logger');
const { COLORS, EMOJIS, MESSAGES } = require('../config/constants');

class InteractionHandler {
    constructor(services) {
        this.database = services.database;
        this.crcon = services.crcon;
        this.contest = services.contest;
        this.vipNotifications = services.vipNotifications;
        this.leaderboard = services.leaderboard;
        this.rateLimiter = services.rateLimiter;
        this.client = services.client;
        this.commandHandler = null;
    }

    setCommandHandler(commandHandler) {
        this.commandHandler = commandHandler;
    }

    async handle(interaction) {
        try {
            if (interaction.isChatInputCommand()) {
                if (this.commandHandler) {
                    await this.commandHandler.handleCommand(interaction);
                } else {
                    Logger.error('Command handler not set for interaction handler');
                    await interaction.reply({
                        content: '❌ Internal error: Command handler not available.',
                        ephemeral: true
                    });
                }
            } else if (interaction.isModalSubmit()) {
                await this.handleModalSubmit(interaction);
            } else if (interaction.isButton()) {
                await this.handleButtonInteraction(interaction);
            }
        } catch (error) {
            Logger.error('Error in interaction handler:', error);
            throw error;
        }
    }

    async handleButtonInteraction(interaction) {
        const customId = interaction.customId;
        
        try {
            if (customId.startsWith('panel_')) {
                await this.handleVipPanelButtons(interaction);
            } else if (customId.startsWith('leaderboard_')) {
                await this.handleLeaderboardButton(interaction);
            } else if (customId.startsWith('contest_')) {
                await this.handleContestButton(interaction);
            } else {
                Logger.warn(`Unknown button interaction: ${customId}`);
                await interaction.reply({
                    content: '❌ Unknown button interaction.',
                    ephemeral: true
                });
            }
        } catch (error) {
            Logger.error(`Error handling button ${customId}:`, error);
            throw error;
        }
    }

    async handleVipPanelButtons(interaction) {
        const action = interaction.customId.replace('panel_', '');
        
        switch (action) {
            case 'link_account':
                await this.showLinkModal(interaction);
                break;
            case 'check_vip':
                await this.handlePanelCheckVip(interaction);
                break;
            case 'view_stats':
                await this.handlePanelViewStats(interaction);
                break;
            case 'contest':
                await this.handlePanelContest(interaction);
                break;
            case 'unlink_account':
                await this.handlePanelUnlink(interaction);
                break;
            case 'help':
                await this.handlePanelHelp(interaction);
                break;
            default:
                await interaction.reply({
                    content: '❌ Unknown panel action.',
                    ephemeral: true
                });
        }
    }

    async showLinkModal(interaction) {
        try {
            const modal = new ModalBuilder()
                .setCustomId('link_account_modal')
                .setTitle('🔗 Link Your T17 Account');

            const usernameInput = new TextInputBuilder()
                .setCustomId('t17_username_input')
                .setLabel('Your T17 Username')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter your exact T17 username...')
                .setRequired(true)
                .setMaxLength(50);

            const row = new ActionRowBuilder().addComponents(usernameInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
            
        } catch (error) {
            Logger.error('Error showing link modal:', error);
            await interaction.reply({
                content: '❌ Failed to show link form. Please use `/link` command instead.',
                ephemeral: true
            });
        }
    }

    async handleModalSubmit(interaction) {
        const customId = interaction.customId;
        
        try {
            if (customId === 'link_account_modal') {
                await this.handleLinkModalSubmit(interaction);
            } else {
                Logger.warn(`Unknown modal submit: ${customId}`);
                await interaction.reply({
                    content: '❌ Unknown form submission.',
                    ephemeral: true
                });
            }
        } catch (error) {
            Logger.error(`Error handling modal ${customId}:`, error);
            throw error;
        }
    }

    async handleLinkModalSubmit(interaction) {
        try {
            const t17Username = interaction.fields.getTextInputValue('t17_username_input').trim();
            const discordId = interaction.user.id;

            const existingLink = await this.database.getPlayerByDiscordId(discordId);
            if (existingLink) {
                return await interaction.reply({
                    content: `❌ You're already linked to **${existingLink.t17Username}**. Use the "🔓 Unlink Account" button first if you want to change accounts.`,
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const playerData = await this.crcon.getPlayerByT17Username(t17Username);
            
            if (!playerData) {
                return await interaction.editReply({
                    content: `❌ T17 username "${t17Username}" not found in Hell Let Loose records.\n\n**Make sure:**\n• You've played on this server recently\n• Your T17 username is spelled exactly correct\n• You're not banned from the server`
                });
            }

            const existingPlayer = await this.database.getPlayerBySteamId(playerData.steam_id_64);
            if (existingPlayer) {
                return await interaction.editReply({
                    content: `❌ The T17 account "${playerData.name}" is already linked to another Discord user.`
                });
            }

            await this.database.createPlayerLink({
                discordId,
                t17Username: playerData.name,
                displayName: playerData.display_name || playerData.name,
                steamId: playerData.steam_id_64,
                platform: this.crcon.detectPlatform(playerData),
                lastSeen: playerData.last_seen
            });

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Account Linked Successfully!')
                .addFields(
                    { name: '🎮 T17 Username', value: playerData.name, inline: true },
                    { name: '🎯 Platform', value: this.crcon.detectPlatform(playerData), inline: true },
                    { name: '📅 Linked At', value: new Date().toLocaleString(), inline: true }
                )
                .setFooter({ text: 'You can now use the VIP panel buttons to check your status!' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            Logger.error('Error in link modal submit:', error);
            await interaction.editReply({
                content: '❌ Failed to link account. The server might be temporarily unavailable.'
            });
        }
    }

    async handlePanelCheckVip(interaction) {
        const linkedData = await this.database.getPlayerByDiscordId(interaction.user.id);
        if (!linkedData) {
            return await interaction.reply({
                content: '❌ You haven\'t linked your Hell Let Loose account yet. Use the "🔗 Link My Account" button first!',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const vipData = await this.crcon.getVipStatus(linkedData.steamId);

            const embed = new EmbedBuilder()
                .setTitle(`🎖️ VIP Status - ${linkedData.t17Username}`)
                .setColor(vipData.isVip ? 0xFFD700 : 0x808080)
                .setThumbnail(interaction.user.displayAvatarURL());

            if (vipData.isVip) {
                const statusIcon = vipData.daysRemaining > 7 ? '🟢' : vipData.daysRemaining > 3 ? '🟡' : '🔴';
                embed.addFields(
                    { name: '✅ VIP Status', value: `${statusIcon} Active`, inline: true },
                    { name: '⏰ Expires', value: vipData.expirationDate || 'Never', inline: true },
                    { name: '📅 Days Remaining', value: vipData.daysRemaining?.toString() || 'Unlimited', inline: true }
                );

                if (vipData.daysRemaining <= 7 && vipData.daysRemaining > 0) {
                    embed.setFooter({ text: '⚠️ VIP expiring soon! Contact an admin to renew.' });
                }
            } else {
                embed.addFields(
                    { name: '❌ VIP Status', value: '🔴 Not Active', inline: true },
                    { name: '💡 How to get VIP', value: 'Contact server administrators', inline: true }
                );
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            Logger.error('Error checking VIP from panel:', error);
            await interaction.editReply({
                content: '❌ Failed to check VIP status. The server might be temporarily unavailable.'
            });
        }
    }

    async handlePanelViewStats(interaction) {
        const linkedData = await this.database.getPlayerByDiscordId(interaction.user.id);
        if (!linkedData) {
            return await interaction.reply({
                content: '❌ You haven\'t linked your Hell Let Loose account yet. Use the "🔗 Link My Account" button first!',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const embed = new EmbedBuilder()
                .setTitle(`👤 Hell Let Loose Profile`)
                .setColor(0x00D4FF)
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: '🎮 T17 Username', value: linkedData.t17Username, inline: true },
                    { name: '🎯 Platform', value: linkedData.platform, inline: true },
                    { name: '🔗 Linked Since', value: new Date(linkedData.linkedAt).toLocaleDateString(), inline: true }
                );

            if (linkedData.displayName && linkedData.displayName !== linkedData.t17Username) {
                embed.addFields({ name: '📝 Display Name', value: linkedData.displayName, inline: true });
            }

            embed.setFooter({ text: `Discord: ${interaction.user.tag}` });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            Logger.error('Error viewing stats from panel:', error);
            await interaction.editReply({
                content: '❌ Failed to load profile. The server might be temporarily unavailable.'
            });
        }
    }

    async handlePanelContest(interaction) {
        const currentContest = await this.contest.getCurrentContest();
        
        if (!currentContest) {
            return await interaction.reply({
                content: '❌ No active contest at the moment. Check back later!',
                ephemeral: true
            });
        }

        const now = new Date();
        const endTime = new Date(currentContest.endTime);
        const timeLeft = currentContest.active ? Math.max(0, Math.ceil((endTime - now) / (1000 * 60 * 60))) : 0;

        const embed = new EmbedBuilder()
            .setColor(currentContest.active ? 0xFFD700 : 0x808080)
            .setTitle(`🏆 Current Contest: ${currentContest.title}`)
            .addFields(
                { name: '📄 How to Enter', value: currentContest.description, inline: false },
                { name: '🎁 Prize', value: currentContest.prize, inline: true },
                { name: '📊 Status', value: currentContest.active ? '🟢 Active' : '🔴 Ended', inline: true }
            );

        if (currentContest.active && timeLeft > 0) {
            embed.addFields({ name: '⏰ Time Remaining', value: `${timeLeft} hours`, inline: true });
        }

        if (currentContest.winners) {
            const winnerList = currentContest.winners.map(w => w.tag).join('\n');
            embed.addFields({ name: '👑 Winners', value: winnerList, inline: false });
        } else if (!currentContest.active) {
            embed.addFields({ name: '👑 Winners', value: 'To be announced soon!', inline: false });
        }

        embed.setFooter({ text: 'Good luck and have fun!' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handlePanelUnlink(interaction) {
        const linkedData = await this.database.getPlayerByDiscordId(interaction.user.id);

        if (!linkedData) {
            return await interaction.reply({
                content: '❌ You don\'t have any linked Hell Let Loose account.',
                ephemeral: true
            });
        }

        await this.database.deletePlayerLink(interaction.user.id);

        const embed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle('🔓 Account Unlinked')
            .setDescription(`Your Discord account has been unlinked from T17 username **${linkedData.t17Username}**.`)
            .setFooter({ text: 'You can link a new account anytime using the panel!' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handlePanelHelp(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle('❓ Help & Support')
            .setDescription('**Need help with the VIP system? Here\'s how to get started:**')
            .addFields(
                { name: '🔍 Finding Your T17 Username', value: '• Open Hell Let Loose\n• Go to Settings → Account\n• Copy your T17 username exactly', inline: false },
                { name: '🎮 For Console Players', value: '• **PlayStation:** Your T17 name might be different from PSN\n• **Xbox:** Your T17 name might be different from Gamertag\n• **PC:** Usually your Steam name', inline: false },
                { name: '❌ Common Issues', value: '• Make sure you\'ve played on our server recently\n• Copy your name exactly as shown in-game\n• Contact an admin if you\'re still having trouble', inline: false },
                { name: '🏆 Contests', value: '• Join active contests for a chance to win VIP\n• Follow contest rules and submit required proof\n• Winners are announced here and in-game', inline: false }
            );

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handleLeaderboardButton(interaction) {
        if (!this.leaderboard) {
            return await interaction.reply({
                content: '❌ Leaderboard service not available.',
                ephemeral: true
            });
        }

        await this.leaderboard.handleButtonInteraction(interaction);
    }

    async handleContestButton(interaction) {
        if (!this.contest) {
            return await interaction.reply({
                content: '❌ Contest service not available.',
                ephemeral: true
            });
        }

        Logger.debug(`Contest button interaction: ${interaction.customId}`);
        await interaction.reply({
            content: '❌ Contest button interactions not yet implemented.',
            ephemeral: true
        });
    }
}

module.exports = InteractionHandler;
