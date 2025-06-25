const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('steam_id')
                        .setDescription('The player\'s Steam ID (alternative to T17 username)')
                        .setRequired(false)
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
                .setName('vippanel')
                .setDescription('Create the VIP panel for players (Admin only)')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel to post the VIP panel in')
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
                .setDefaultMemberPermissions('0'),

            new SlashCommandBuilder()
                .setName('debugvip')
                .setDescription('Debug VIP status checking (Admin only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Discord user to debug (optional)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('steam_id')
                        .setDescription('Steam ID to debug directly (optional)')
                        .setRequired(false)
                )
                .setDefaultMemberPermissions('0'),

            new SlashCommandBuilder()
                .setName('debugplayer')
                .setDescription('Debug player search across all endpoints (Admin only)')
                .addStringOption(option =>
                    option.setName('t17_username')
                        .setDescription('T17 username to search for')
                        .setRequired(true)
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
                case 'vippanel':
                    await this.handleVipPanelCommand(interaction);
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
                case 'debugvip':
                    await this.handleDebugVipCommand(interaction);
                    break;
                case 'debugplayer':
                    await this.handleDebugPlayerCommand(interaction);
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

    async handleVipPanelCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        const embed = new EmbedBuilder()
            .setColor(0x00D4FF)
            .setTitle('🎖️ HLL Player VIP Checker')
            .setDescription('**Link your account and manage your VIP status!**\n\nClick the buttons below to get started. No typing required!')
            .addFields(
                { name: '🔗 Link Account', value: 'Connect your Discord to your Hell Let Loose T17 username', inline: true },
                { name: '🎖️ Check VIP', value: 'View your VIP status and expiration date', inline: true },
                { name: '📊 View Stats', value: 'See your detailed Hell Let Loose statistics', inline: true }
            )
            .setFooter({ text: 'HLL Player VIP Checker by StoneyRebel' })
            .setTimestamp();

        const actionRow1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('panel_link_account')
                    .setLabel('🔗 Link My Account')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('panel_check_vip')
                    .setLabel('🎖️ Check My VIP')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('panel_view_stats')
                    .setLabel('📊 View My Stats')
                    .setStyle(ButtonStyle.Secondary)
            );

        const actionRow2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('panel_contest')
                    .setLabel('🏆 VIP Contest')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('panel_unlink_account')
                    .setLabel('🔓 Unlink Account')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('panel_help')
                    .setLabel('❓ Help & Support')
                    .setStyle(ButtonStyle.Secondary)
            );

        try {
            await targetChannel.send({ 
                embeds: [embed], 
                components: [actionRow1, actionRow2] 
            });

            await interaction.reply({
                content: `✅ VIP panel created in ${targetChannel}!`,
                ephemeral: true
            });

        } catch (error) {
            Logger.error('Error creating VIP panel:', error);
            await interaction.reply({
                content: '❌ Failed to create VIP panel.',
                ephemeral: true
            });
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

    async handleDebugVipCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user');
        const steamIdInput = interaction.options.getString('steam_id');
        
        await interaction.deferReply({ ephemeral: true });

        try {
            let steamId = steamIdInput;
            let linkedPlayer = null;
            
            if (targetUser) {
                linkedPlayer = await this.database.getPlayerByDiscordId(targetUser.id);
                if (!linkedPlayer) {
                    return await interaction.editReply({
                        content: `❌ User ${targetUser.tag} doesn't have a linked Hell Let Loose account.`
                    });
                }
                steamId = linkedPlayer.steamId;
            }

            if (!steamId) {
                return await interaction.editReply({
                    content: '❌ Please provide either a Discord user or Steam ID to debug.'
                });
            }

            const debugData = await this.crcon.debugVipData(steamId);
            const vipStatus = await this.crcon.getVipStatus(steamId);

            const embed = new EmbedBuilder()
                .setColor(0x9B59B6)
                .setTitle('🔍 VIP Debug Information')
                .addFields(
                    { name: '🆔 Steam ID', value: `\`${steamId}\``, inline: true },
                    { name: '👤 Target User', value: targetUser ? targetUser.tag : 'Direct Steam ID', inline: true },
                    { name: '🔗 Linked Player', value: linkedPlayer ? linkedPlayer.t17Username : 'N/A', inline: true }
                );

            if (debugData.error) {
                embed.addFields({
                    name: '❌ Debug Error',
                    value: `\`\`\`${debugData.error}\`\`\``,
                    inline: false
                });
            } else {
                embed.addFields(
                    { name: '📊 Total VIP Entries', value: debugData.totalVipEntries.toString(), inline: true },
                    { name: '🎯 Match Found', value: debugData.matchingEntry ? '✅ Yes' : '❌ No', inline: true },
                    { name: '📋 Response Format', value: `Array: ${debugData.responseFormat.isArray}\nHas Result: ${debugData.responseFormat.hasResult}\nType: ${debugData.responseFormat.type}`, inline: true }
                );

                if (debugData.matchingEntry) {
                    const vipEntry = debugData.matchingEntry;
                    embed.addFields({
                        name: '📋 VIP Entry Details',
                        value: `\`\`\`json\n${JSON.stringify(vipEntry, null, 2)}\`\`\``,
                        inline: false
                    });
                }

                embed.addFields({
                    name: '🎖️ VIP Status Result',
                    value: `**Is VIP:** ${vipStatus.isVip ? '✅ Yes' : '❌ No'}\n` +
                           `**Expiration:** ${vipStatus.expirationDate || 'N/A'}\n` +
                           `**Days Remaining:** ${vipStatus.daysRemaining !== null ? vipStatus.daysRemaining : 'N/A'}`,
                    inline: false
                });

                if (debugData.vipData && debugData.vipData.length > 0) {
                    const sampleEntries = debugData.vipData.slice(0, 3).map(vip => {
                        const entry = {};
                        ['player_id', 'steam_id_64', 'steamId', 'description', 'expiration'].forEach(field => {
                            if (vip[field] !== undefined) entry[field] = vip[field];
                        });
                        return entry;
                    });

                    embed.addFields({
                        name: '📝 Sample VIP Entries (First 3)',
                        value: `\`\`\`json\n${JSON.stringify(sampleEntries, null, 2)}\`\`\``,
                        inline: false
                    });
                }
            }

            embed.setFooter({ text: 'This debug info helps troubleshoot VIP detection issues' });
            embed.setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            Logger.error('Error in debug VIP command:', error);
            await interaction.editReply({
                content: `❌ Debug failed: ${error.message}`
            });
        }
    }

    async handleDebugPlayerCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const t17Username = interaction.options.getString('t17_username');
        
        await interaction.deferReply({ ephemeral: true });

        try {
            const debugData = await this.crcon.debugPlayerSearch(t17Username);
            const playerResult = await this.crcon.getPlayerByT17Username(t17Username);

            const embed = new EmbedBuilder()
                .setColor(0x00D4FF)
                .setTitle('🔍 Player Search Debug Information')
                .addFields(
                    { name: '🎮 Search Term', value: `\`${t17Username}\``, inline: true },
                    { name: '🎯 Final Result', value: playerResult ? '✅ Found' : '❌ Not Found', inline: true }
                );

            if (playerResult) {
                embed.addFields({
                    name: '👤 Player Data Found',
                    value: `**Name:** ${playerResult.name}\n**Steam ID:** ${playerResult.steam_id_64}\n**Display Name:** ${playerResult.display_name}`,
                    inline: false
                });
            }

            if (debugData.error) {
                embed.addFields({
                    name: '❌ Debug Error',
                    value: `\`\`\`${debugData.error}\`\`\``,
                    inline: false
                });
            } else {
                // Show results from each endpoint
                for (const [endpointName, result] of Object.entries(debugData.endpointResults)) {
                    let resultText = '';
                    
                    if (result.success) {
                        resultText = `✅ **Success**\n`;
                        resultText += `Type: ${result.dataType}\n`;
                        resultText += `Array: ${result.isArray}\n`;
                        resultText += `Count: ${result.count}\n`;
                        
                        if (result.sample && typeof result.sample === 'object') {
                            const sampleText = JSON.stringify(result.sample, null, 2);
                            if (sampleText.length < 200) {
                                resultText += `\`\`\`json\n${sampleText}\`\`\``;
                            } else {
                                resultText += '`Sample too large to display`';
                            }
                        }
                    } else {
                        resultText = `❌ **Failed**\n\`${result.error}\``;
                    }

                    embed.addFields({
                        name: `🔌 ${endpointName}`,
                        value: resultText,
                        inline: true
                    });
                }
            }

            embed.setFooter({ text: 'This debug info helps troubleshoot player search issues' });
            embed.setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            Logger.error('Error in debug player command:', error);
            await interaction.editReply({
                content: `❌ Debug failed: ${error.message}`
            });
        }
    }

    // Add any missing handler methods here
    async handleProfileCommand(interaction) {
        // Profile command handler - implement as needed
        await interaction.reply({
            content: '🚧 Profile command not implemented yet.',
            ephemeral: true
        });
    }

    async handleAdminLinkCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('discord_user');
        const t17Username = interaction.options.getString('t17_username');
        const steamId = interaction.options.getString('steam_id');

        // Validate input - need either T17 username or Steam ID
        if (!t17Username && !steamId) {
            return await interaction.reply({
                content: '❌ You must provide either a T17 username or Steam ID.',
                ephemeral: true
            });
        }

        if (t17Username && steamId) {
            return await interaction.reply({
                content: '❌ Please provide either T17 username OR Steam ID, not both.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Check if Discord user is already linked
            const existingLink = await this.database.getPlayerByDiscordId(targetUser.id);
            if (existingLink) {
                return await interaction.editReply({
                    content: `❌ ${targetUser.tag} is already linked to **${existingLink.t17Username}** (${existingLink.steamId}). Use \`/unlink\` first if you want to change their account.`
                });
            }

            let playerData = null;

            if (steamId) {
                // Using Steam ID directly
                Logger.info(`🔗 Admin linking ${targetUser.tag} using Steam ID: ${steamId}`);
                
                // Validate Steam ID format
                if (!this.isValidSteamId(steamId)) {
                    return await interaction.editReply({
                        content: `❌ Invalid Steam ID format: ${steamId}\n\nSteam ID should be 17 digits starting with 76561... or 11000...`
                    });
                }

                // Check if Steam ID is already linked
                const existingPlayer = await this.database.getPlayerBySteamId(steamId);
                if (existingPlayer) {
                    return await interaction.editReply({
                        content: `❌ Steam ID ${steamId} is already linked to another Discord user.`
                    });
                }

                // Try to get player name from CRCON using Steam ID
                let playerName = steamId; // Fallback to Steam ID if name not found
                let displayName = steamId;
                let platform = '🎮 Unknown';

                try {
                    // Try to find the player in VIP list first (most reliable)
                    const vipData = await this.crcon.makeRequest('/api/get_vip_ids');
                    if (vipData && Array.isArray(vipData)) {
                        const vipEntry = vipData.find(vip => 
                            vip && (vip.player_id === steamId || vip.steam_id_64 === steamId)
                        );
                        if (vipEntry && vipEntry.name) {
                            playerName = vipEntry.name;
                            displayName = vipEntry.name;
                            Logger.info(`✅ Found player name in VIP list: ${playerName}`);
                        }
                    }

                    // If not found in VIP, try current players
                    if (playerName === steamId) {
                        const currentPlayers = await this.crcon.makeRequest('/api/get_players');
                        if (currentPlayers && Array.isArray(currentPlayers)) {
                            const currentPlayer = currentPlayers.find(player => 
                                player && (player.player_id === steamId || player.steam_id_64 === steamId)
                            );
                            if (currentPlayer && currentPlayer.name) {
                                playerName = currentPlayer.name;
                                displayName = currentPlayer.name;
                                Logger.info(`✅ Found player name in current players: ${playerName}`);
                            }
                        }
                    }

                    // If not found in current players, try playerids
                    if (playerName === steamId) {
                        const playerIds = await this.crcon.makeRequest('/api/get_playerids');
                        if (playerIds && Array.isArray(playerIds)) {
                            const playerEntry = playerIds.find(([name, id]) => id === steamId);
                            if (playerEntry) {
                                playerName = playerEntry[0];
                                displayName = playerEntry[0];
                                Logger.info(`✅ Found player name in playerids: ${playerName}`);
                            }
                        }
                    }

                    // Detect platform
                    platform = this.crcon.detectPlatform({ 
                        steam_id_64: steamId, 
                        name: playerName 
                    });

                } catch (error) {
                    Logger.warn('Could not retrieve player name from CRCON:', error.message);
                    // Continue with Steam ID as name
                }

                playerData = {
                    name: playerName,
                    steam_id_64: steamId,
                    display_name: displayName,
                    platform: platform
                };

            } else {
                // Using T17 username lookup
                Logger.info(`🔗 Admin linking ${targetUser.tag} using T17 username: ${t17Username}`);
                
                playerData = await this.crcon.getPlayerByT17Username(t17Username.trim());
                
                if (!playerData) {
                    return await interaction.editReply({
                        content: `❌ T17 username "${t17Username}" not found in Hell Let Loose records.\n\n**Make sure:**\n• The username is spelled exactly correct\n• The player has played on this server recently\n• The player is not banned from the server`
                    });
                }

                // Check if this Steam ID is already linked
                const existingPlayer = await this.database.getPlayerBySteamId(playerData.steam_id_64);
                if (existingPlayer) {
                    return await interaction.editReply({
                        content: `❌ The T17 account "${playerData.name}" (${playerData.steam_id_64}) is already linked to another Discord user.`
                    });
                }
            }

            // Create the player link
            await this.database.createPlayerLink({
                discordId: targetUser.id,
                t17Username: playerData.name,
                displayName: playerData.display_name || playerData.name,
                steamId: playerData.steam_id_64,
                platform: playerData.platform || this.crcon.detectPlatform(playerData),
                lastSeen: playerData.last_seen || null
            });

            // Get VIP status for the newly linked player
            let vipStatus = null;
            try {
                vipStatus = await this.crcon.getVipStatus(playerData.steam_id_64);
            } catch (error) {
                Logger.warn('Could not fetch VIP status for newly linked player:', error.message);
            }

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Player Account Linked Successfully!')
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: '👤 Discord User', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
                    { name: '🎮 T17 Username', value: playerData.name, inline: true },
                    { name: '🆔 Steam ID', value: playerData.steam_id_64, inline: true },
                    { name: '🎯 Platform', value: playerData.platform || '🎮 Unknown', inline: true },
                    { name: '🔗 Linked By', value: `${interaction.user.tag}`, inline: true },
                    { name: '📅 Linked At', value: new Date().toLocaleString(), inline: true }
                );

            if (vipStatus && vipStatus.isVip) {
                const statusIcon = vipStatus.daysRemaining > 7 ? '🟢' : vipStatus.daysRemaining > 3 ? '🟡' : '🔴';
                embed.addFields({
                    name: '🎖️ VIP Status', 
                    value: `${statusIcon} Active (${vipStatus.daysRemaining || '∞'} days remaining)`, 
                    inline: false 
                });
            } else {
                embed.addFields({
                    name: '🎖️ VIP Status', 
                    value: '❌ Not VIP', 
                    inline: false 
                });
            }

            embed.setFooter({ 
                text: `Player can now use /vip to check their status` 
            });

            await interaction.editReply({ embeds: [embed] });

            // Log the admin action
            Logger.info(`🔗 Admin link completed: ${interaction.user.tag} linked ${targetUser.tag} to ${playerData.name} (${playerData.steam_id_64})`);

            // Optionally notify the linked user via DM
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🎖️ Account Linked!')
                    .setDescription(`Your Discord account has been linked to your Hell Let Loose account by a server administrator.`)
                    .addFields(
                        { name: '🎮 Linked Account', value: playerData.name, inline: true },
                        { name: '🎯 Platform', value: playerData.platform || '🎮 Unknown', inline: true }
                    )
                    .setFooter({ text: 'You can now use /vip to check your VIP status!' });

                await targetUser.send({ embeds: [dmEmbed] });
                Logger.info(`📧 Notification sent to ${targetUser.tag}`);
            } catch (dmError) {
                Logger.debug(`Could not send DM to ${targetUser.tag}:`, dmError.message);
                // Don't fail the command if DM fails
            }

        } catch (error) {
            Logger.error('Error in admin link command:', error);
            await interaction.editReply({
                content: `❌ Failed to link account: ${error.message}\n\nThe server might be temporarily unavailable, or the player data could not be found.`
            });
        }
    }

    isValidSteamId(steamId) {
        // Steam ID should be 17 digits and start with 765611 (Steam) or 11000 (Console)
        const steamIdRegex = /^(765611\d{11}|11000\d{12})$/;
        return steamIdRegex.test(steamId);
    }

    async handleVipNotifyCommand(interaction) {
        // VIP notify command handler - implement as needed
        await interaction.reply({
            content: '🚧 VIP notify command not implemented yet.',
            ephemeral: true
        });
    }
}

module.exports = CommandHandler;
