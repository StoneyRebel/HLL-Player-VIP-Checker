const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Logger = require('../utils/logger');
const { Validators, ValidationError } = require('../utils/validators');
const PermissionChecker = require('../utils/permissions');
const { COLORS, EMOJIS, MESSAGES } = require('../config/constants');

class CommandHandler {
    constructor(services) {
        this.database = services.database;
        this.crcon = services.crcon;
        this.contest = services.contest;
        this.vipNotifications = services.vipNotifications;
        this.leaderboard = services.leaderboard;
        this.rateLimiter = services.rateLimiter;
        this.client = services.client;
    }

    async registerCommands() {
        Logger.info('📝 Building command definitions...');
        
        const commands = [
            new SlashCommandBuilder()
                .setName('link')
                .setDescription('Link your T17 username to your Discord account')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('Your T17 username (as shown in Hell Let Loose)')
                        .setRequired(true)
                ),
            
            new SlashCommandBuilder()
                .setName('vip')
                .setDescription('Check your VIP status and remaining time')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Check another user\'s VIP status (optional)')
                        .setRequired(false)
                ),
            
            new SlashCommandBuilder()
                .setName('unlink')
                .setDescription('Unlink your T17 username from your Discord account'),
            
            new SlashCommandBuilder()
                .setName('profile')
                .setDescription('View your linked Hell Let Loose profile')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('View another user\'s profile (optional)')
                        .setRequired(false)
                ),

            new SlashCommandBuilder()
                .setName('status')
                .setDescription('Check bot and CRCON connection status'),

            new SlashCommandBuilder()
                .setName('adminlink')
                .setDescription('Manually link a player account (Admin only)')
                .addUserOption(option =>
                    option.setName('discord_user')
                        .setDescription('The Discord user to link')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('t17_username')
                        .setDescription('The player\'s T17 username')
                        .setRequired(true)
                )
                .setDefaultMemberPermissions('0'),

            new SlashCommandBuilder()
                .setName('vipnotify')
                .setDescription('Configure VIP expiration notifications (Admin only)')
                .addIntegerOption(option =>
                    option.setName('warning_days')
                        .setDescription('Days before expiration to send warning (default: 7)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(30)
                )
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Enable or disable VIP notifications')
                        .setRequired(false)
                )
                .setDefaultMemberPermissions('0'),

            new SlashCommandBuilder()
                .setName('contest')
                .setDescription('Manage VIP contests (Admin only)')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('create')
                        .setDescription('Create a new VIP contest')
                        .addStringOption(option =>
                            option.setName('title')
                                .setDescription('Contest title')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option.setName('description')
                                .setDescription('What players need to do')
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option.setName('duration_hours')
                                .setDescription('How long the contest runs (hours)')
                                .setRequired(true)
                                .setMinValue(1)
                                .setMaxValue(168)
                        )
                        .addStringOption(option =>
                            option.setName('prize')
                                .setDescription('Contest prize (e.g., "7 days VIP")')
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option.setName('max_winners')
                                .setDescription('Maximum number of winners')
                                .setRequired(false)
                                .setMinValue(1)
                                .setMaxValue(10)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('end')
                        .setDescription('End the current contest')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('winners')
                        .setDescription('Select contest winners')
                        .addStringOption(option =>
                            option.setName('winner_ids')
                                .setDescription('Discord user IDs separated by commas')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('status')
                        .setDescription('Check current contest status')
                )
                .setDefaultMemberPermissions('0'),

            new SlashCommandBuilder()
                .setName('createleaderboard')
                .setDescription('Create a live-updating leaderboard (Admin only)')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel to post leaderboard in')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Leaderboard type')
                        .setRequired(false)
                        .addChoices(
                            { name: '💀 Most Kills', value: 'kills' },
                            { name: '🎯 Highest Score', value: 'score' },
                            { name: '⏱️ Most Playtime', value: 'playtime' },
                            { name: '📈 Best K/D Ratio', value: 'kdr' }
                        )
                )
                .setDefaultMemberPermissions('0'),

            new SlashCommandBuilder()
                .setName('testmessage')
                .setDescription('Test in-game messaging system (Admin only)')
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Test message to send (optional)')
                        .setRequired(false)
                )
                .setDefaultMemberPermissions('0')
        ];

        Logger.info(`📋 Prepared ${commands.length} commands for registration`);

        try {
            Logger.info('🔄 Registering slash commands to Discord...');
            
            const result = await this.client.application.commands.set(commands);
            Logger.info(`✅ Successfully registered ${result.size} commands!`);
            
            result.forEach(cmd => {
                Logger.info(`  ✓ /${cmd.name}`);
            });
            
        } catch (error) {
            Logger.error('❌ Error registering commands:', error);
            throw error;
        }
    }

    async handleCommand(interaction) {
        const { commandName } = interaction;
        
        try {
            switch (commandName) {
                case 'link':
                    await this.handleLinkCommand(interaction);
                    break;
                case 'vip':
                    await this.handleVipCommand(interaction);
                    break;
                case 'unlink':
                    await this.handleUnlinkCommand(interaction);
                    break;
                case 'profile':
                    await this.handleProfileCommand(interaction);
                    break;
                case 'status':
                    await this.handleStatusCommand(interaction);
                    break;
                case 'adminlink':
                    await this.handleAdminLinkCommand(interaction);
                    break;
                case 'vipnotify':
                    await this.handleVipNotifyCommand(interaction);
                    break;
                case 'contest':
                    await this.handleContestCommand(interaction);
                    break;
                case 'createleaderboard':
                    await this.handleCreateLeaderboardCommand(interaction);
                    break;
                case 'testmessage':
                    await this.handleTestMessageCommand(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Unknown command.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            Logger.error(`Error in command ${commandName}:`, error);
            throw error;
        }
    }

    async handleLinkCommand(interaction) {
        try {
            const t17Username = interaction.options.getString('username').trim();
            const discordId = interaction.user.id;

            const existingLink = await this.database.getPlayerByDiscordId(discordId);
            if (existingLink) {
                return await interaction.reply({
                    content: `❌ You're already linked to **${existingLink.t17Username}**. Use \`/unlink\` first if you want to change accounts.`,
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
                .setFooter({ text: 'You can now use /vip to check your VIP status!' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            Logger.error('Error in link command:', error);
            await interaction.editReply({
                content: '❌ Failed to link account. The server might be temporarily unavailable.'
            });
        }
    }

    async handleVipCommand(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const targetId = targetUser.id;

        const linkedData = await this.database.getPlayerByDiscordId(targetId);
        if (!linkedData) {
            const message = targetUser.id === interaction.user.id 
                ? '❌ You haven\'t linked your Hell Let Loose account yet. Use `/link` to get started!'
                : '❌ That user hasn\'t linked their Hell Let Loose account yet.';
            
            return await interaction.reply({ content: message, ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const vipData = await this.crcon.getVipStatus(linkedData.steamId);

            const embed = new EmbedBuilder()
                .setTitle(`🎖️ VIP Status - ${linkedData.t17Username}`)
                .setColor(vipData.isVip ? 0xFFD700 : 0x808080)
                .setThumbnail(targetUser.displayAvatarURL());

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
            Logger.error('Error checking VIP status:', error);
            await interaction.editReply({
                content: '❌ Failed to check VIP status. The server might be temporarily unavailable.'
            });
        }
    }

    async handleUnlinkCommand(interaction) {
        const discordId = interaction.user.id;
        const linkedData = await this.database.getPlayerByDiscordId(discordId);

        if (!linkedData) {
            return await interaction.reply({
                content: '❌ You don\'t have any linked Hell Let Loose account.',
                ephemeral: true
            });
        }

        await this.database.deletePlayerLink(discordId);

        const embed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle('🔓 Account Unlinked')
            .setDescription(`Your Discord account has been unlinked from T17 username **${linkedData.t17Username}**.`)
            .setFooter({ text: 'You can link a new account anytime with /link' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handleStatusCommand(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const crconStatus = await this.crcon.testConnection();
            const messagingTest = await this.crcon.testMessaging();
            const playerCount = await this.database.getPlayerCount();
            
            const embed = new EmbedBuilder()
                .setTitle(`🤖 Bot Status`)
                .setColor(crconStatus.connected ? 0x00FF00 : 0xFF0000)
                .addFields(
                    { name: '🟢 Bot Status', value: 'Online', inline: true },
                    { name: '📊 Linked Players', value: playerCount.toString(), inline: true },
                    { name: '🌐 CRCON Connection', value: crconStatus.connected ? '🟢 Connected' : '🔴 Disconnected', inline: true }
                );

            if (crconStatus.connected && crconStatus.serverName) {
                embed.addFields(
                    { name: '🎮 Server Name', value: crconStatus.serverName, inline: true },
                    { name: '👥 Players Online', value: `${crconStatus.playerCount}/${crconStatus.maxPlayers}`, inline: true }
                );
            }

            embed.setTimestamp();
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            Logger.error('Error checking status:', error);
            await interaction.editReply({
                content: '❌ Failed to check status. Please try again later.'
            });
        }
    }

    async handleContestCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        
        try {
            switch (subcommand) {
                case 'create':
                    await this.contest.handleCreate(interaction);
                    break;
                case 'end':
                    await this.contest.handleEnd(interaction);
                    break;
                case 'winners':
                    await this.contest.handleWinners(interaction);
                    break;
                case 'status':
                    await this.contest.handleStatus(interaction);
                    break;
            }
        } catch (error) {
            Logger.error(`Error in contest ${subcommand}:`, error);
            throw error;
        }
    }

    async handleCreateLeaderboardCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const type = interaction.options.getString('type') || 'kills';

        await interaction.deferReply({ ephemeral: true });

        try {
            await this.leaderboard.create(channel, type);

            await interaction.editReply({
                content: `✅ Live leaderboard created in ${channel}!\n\n🔄 **Auto-updates every hour**\n📊 **Shows top 20 players**\n🗓️ **Tracks daily/weekly/monthly**`
            });

        } catch (error) {
            Logger.error('Error creating leaderboard:', error);
            await interaction.editReply({
                content: '❌ Failed to create leaderboard. Please try again later.'
            });
        }
    }

    async handleTestMessageCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const testMessage = interaction.options.getString('message') || '🤖 VIP Bot test message - please ignore';

        await interaction.deferReply({ ephemeral: true });

        try {
            await this.crcon.sendMessageToAllPlayers(testMessage);
            
            await interaction.editReply({
                content: `✅ Test message sent successfully!\n\n**Message:** "${testMessage}"\n\nCheck your game server to confirm it appeared.`
            });

        } catch (error) {
            Logger.error('❌ Test message failed:', error.message);
            
            await interaction.editReply({
                content: `❌ Test message failed!\n\n**Error:** ${error.message}\n\n**Suggestions:**\n• Check CRCON connection\n• Verify bot has admin permissions in CRCON`
            });
        }
    }
}

module.exports = CommandHandler;
