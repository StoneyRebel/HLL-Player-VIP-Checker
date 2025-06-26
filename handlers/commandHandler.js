const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const Logger = require('../utils/logger');
const { COLORS, EMOJIS, MESSAGES } = require('../config/constants');
const config = require('../config/environment');

class CommandHandler {
    constructor(services) {
        this.database = services.database;
        this.crcon = services.crcon;
        this.contest = services.contest;
        this.vipNotifications = services.vipNotifications;
        this.leaderboard = services.leaderboard;
        this.rateLimiter = services.rateLimiter;
        this.client = services.client;
        this.commands = [];
    }

    async registerCommands() {
        try {
            Logger.info('🔧 Registering slash commands...');
            
            this.commands = [
                // User Commands
                new SlashCommandBuilder()
                    .setName('link')
                    .setDescription('Link your Discord account to your Hell Let Loose T17 account')
                    .addStringOption(option =>
                        option.setName('t17_username')
                            .setDescription('Your exact T17 username from Hell Let Loose')
                            .setRequired(true)
                    ),

                new SlashCommandBuilder()
                    .setName('unlink')
                    .setDescription('Unlink your Discord account from Hell Let Loose'),

                new SlashCommandBuilder()
                    .setName('vip')
                    .setDescription('Check your VIP status')
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('Check another user\'s VIP status (optional)')
                            .setRequired(false)
                    ),

                new SlashCommandBuilder()
                    .setName('profile')
                    .setDescription('View your Hell Let Loose profile')
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('View another user\'s profile (optional)')
                            .setRequired(false)
                    ),

                // Admin Commands
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
                            .setDescription('The player\'s T17 username (leave empty if using steam_id)')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('steam_id')
                            .setDescription('The player\'s Steam ID (console players: da44ad371a9783c49576845d037966f6)')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('platform')
                            .setDescription('Player platform (optional - will auto-detect if not specified)')
                            .setRequired(false)
                            .addChoices(
                                { name: '💻 PC/Steam', value: 'pc' },
                                { name: '🎮 PlayStation', value: 'ps' },
                                { name: '🎮 Xbox', value: 'xbox' },
                                { name: '🎮 Console', value: 'console' }
                            )
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
                                    .setDescription('How to participate')
                                    .setRequired(true)
                            )
                            .addIntegerOption(option =>
                                option.setName('duration_hours')
                                    .setDescription('Contest duration in hours')
                                    .setRequired(true)
                                    .setMinValue(1)
                                    .setMaxValue(168)
                            )
                            .addStringOption(option =>
                                option.setName('prize')
                                    .setDescription('Contest prize')
                                    .setRequired(true)
                            )
                            .addIntegerOption(option =>
                                option.setName('max_winners')
                                    .setDescription('Maximum number of winners')
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
                                    .setDescription('Discord user IDs of winners (comma-separated)')
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
                    .setName('panel')
                    .setDescription('Create a VIP management panel (Admin only)')
                    .setDefaultMemberPermissions('0'),

                new SlashCommandBuilder()
                    .setName('createleaderboard')
                    .setDescription('Create a live leaderboard (Admin only)')
                    .addStringOption(option =>
                        option.setName('type')
                            .setDescription('Leaderboard type')
                            .setRequired(true)
                            .addChoices(
                                { name: '💀 Most Kills', value: 'kills' },
                                { name: '🎯 Highest Score', value: 'score' },
                                { name: '⏱️ Most Playtime', value: 'playtime' },
                                { name: '📈 Best K/D Ratio', value: 'kdr' }
                            )
                    )
                    .setDefaultMemberPermissions('0'),

                new SlashCommandBuilder()
                    .setName('debug')
                    .setDescription('Debug CRCON connection and data (Admin only)')
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('connection')
                            .setDescription('Test CRCON connection')
                    )
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('vip')
                            .setDescription('Debug VIP data for a Steam ID')
                            .addStringOption(option =>
                                option.setName('steam_id')
                                    .setDescription('Steam ID to debug')
                                    .setRequired(true)
                            )
                    )
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('player')
                            .setDescription('Debug player search')
                            .addStringOption(option =>
                                option.setName('t17_username')
                                    .setDescription('T17 username to search for')
                                    .setRequired(true)
                            )
                    )
                    .setDefaultMemberPermissions('0')
            ];

            Logger.info(`🔄 Refreshing ${this.commands.length} application (/) commands...`);
            
            // Log each command being registered
            this.commands.forEach(cmd => {
                Logger.debug(`Registering command: ${cmd.name}`);
            });

            const rest = new REST({ version: '9' }).setToken(config.discord.token);

            await rest.put(
                Routes.applicationCommands(config.discord.clientId),
                { body: this.commands }
            );

            Logger.info('✅ Successfully reloaded application (/) commands.');
            Logger.info(`📋 Registered commands: ${this.commands.map(cmd => cmd.name).join(', ')}`);

        } catch (error) {
            Logger.error('❌ Failed to register commands:', error);
            throw error;
        }
    }

    async handleCommand(interaction) {
        const { commandName } = interaction;

        try {
            Logger.debug(`Handling command: ${commandName}`);
            
            switch (commandName) {
                case 'link':
                    await this.handleLinkCommand(interaction);
                    break;
                case 'unlink':
                    await this.handleUnlinkCommand(interaction);
                    break;
                case 'vip':
                    await this.handleVipCommand(interaction);
                    break;
                case 'profile':
                    await this.handleProfileCommand(interaction);
                    break;
                case 'adminlink':
                    await this.handleAdminLinkCommand(interaction);
                    break;
                case 'contest':
                    await this.handleContestCommand(interaction);
                    break;
                case 'panel':
                    await this.handlePanelCommand(interaction);
                    break;
                case 'createleaderboard':
                    Logger.debug('Processing createleaderboard command');
                    await this.handleCreateLeaderboardCommand(interaction);
                    break;
                case 'debug':
                    await this.handleDebugCommand(interaction);
                    break;
                default:
                    Logger.warn(`Unknown command received: ${commandName}`);
                    await interaction.reply({
                        content: `❌ Unknown command: ${commandName}`,
                        ephemeral: true
                    });
            }
        } catch (error) {
            Logger.error(`Error handling command ${commandName}:`, error);
            throw error;
        }
    }

    async handleLinkCommand(interaction) {
        const t17Username = interaction.options.getString('t17_username').trim();
        const discordId = interaction.user.id;

        const existingLink = await this.database.getPlayerByDiscordId(discordId);
        if (existingLink) {
            return await interaction.reply({
                content: MESSAGES.ERRORS.ALREADY_LINKED.replace('{username}', existingLink.t17Username),
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const playerData = await this.crcon.getPlayerByT17Username(t17Username);
            
            if (!playerData) {
                return await interaction.editReply({
                    content: MESSAGES.ERRORS.USERNAME_NOT_FOUND.replace('{username}', t17Username) + '\n\n' + MESSAGES.INFO.HOW_TO_FIND_USERNAME
                });
            }

            const existingPlayer = await this.database.getPlayerBySteamId(playerData.steam_id_64);
            if (existingPlayer) {
                return await interaction.editReply({
                    content: MESSAGES.ERRORS.ALREADY_LINKED_TO_ANOTHER.replace('{username}', playerData.name)
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
                .setColor(COLORS.SUCCESS)
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
                content: MESSAGES.ERRORS.SERVER_UNAVAILABLE
            });
        }
    }

    async handleUnlinkCommand(interaction) {
        const linkedData = await this.database.getPlayerByDiscordId(interaction.user.id);

        if (!linkedData) {
            return await interaction.reply({
                content: '❌ You don\'t have any linked Hell Let Loose account.',
                ephemeral: true
            });
        }

        await this.database.deletePlayerLink(interaction.user.id);

        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('🔓 Account Unlinked')
            .setDescription(`Your Discord account has been unlinked from T17 username **${linkedData.t17Username}**.`)
            .setFooter({ text: 'You can link a new account anytime using /link!' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handleVipCommand(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const linkedData = await this.database.getPlayerByDiscordId(targetUser.id);

        if (!linkedData) {
            return await interaction.reply({
                content: targetUser.id === interaction.user.id 
                    ? '❌ You haven\'t linked your Hell Let Loose account yet. Use `/link` to get started!'
                    : MESSAGES.ERRORS.USER_NOT_LINKED,
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const vipData = await this.crcon.getVipStatus(linkedData.steamId);

            const embed = new EmbedBuilder()
                .setTitle(`🎖️ VIP Status - ${linkedData.t17Username}`)
                .setColor(vipData.isVip ? COLORS.VIP_ACTIVE : COLORS.VIP_EXPIRED)
                .setThumbnail(targetUser.displayAvatarURL());

            if (vipData.isVip) {
                const statusIcon = vipData.daysRemaining > 7 ? '🟢' : vipData.daysRemaining > 3 ? '🟡' : '🔴';
                embed.addFields(
                    { name: '✅ VIP Status', value: `${statusIcon} Active`, inline: true },
                    { name: '⏰ Expires', value: vipData.expirationDate || 'Never', inline: true },
                    { name: '📅 Days Remaining', value: vipData.daysRemaining?.toString() || 'Unlimited', inline: true }
                );

                if (vipData.daysRemaining <= 7 && vipData.daysRemaining > 0) {
                    embed.setFooter({ text: MESSAGES.INFO.VIP_EXPIRING_SOON });
                }
            } else {
                embed.addFields(
                    { name: '❌ VIP Status', value: '🔴 Not Active', inline: true },
                    { name: '💡 How to get VIP', value: 'Contact server administrators', inline: true }
                );
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            Logger.error('Error in VIP command:', error);
            await interaction.editReply({
                content: MESSAGES.ERRORS.SERVER_UNAVAILABLE
            });
        }
    }

    async handleProfileCommand(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const linkedData = await this.database.getPlayerByDiscordId(targetUser.id);

        if (!linkedData) {
            return await interaction.reply({
                content: targetUser.id === interaction.user.id 
                    ? '❌ You haven\'t linked your Hell Let Loose account yet. Use `/link` to get started!'
                    : MESSAGES.ERRORS.USER_NOT_LINKED,
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`👤 Hell Let Loose Profile`)
            .setColor(COLORS.INFO)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { name: '🎮 T17 Username', value: linkedData.t17Username, inline: true },
                { name: '🎯 Platform', value: linkedData.platform, inline: true },
                { name: '🔗 Linked Since', value: new Date(linkedData.linkedAt).toLocaleDateString(), inline: true }
            );

        if (linkedData.displayName && linkedData.displayName !== linkedData.t17Username) {
            embed.addFields({ name: '📝 Display Name', value: linkedData.displayName, inline: true });
        }

        embed.setFooter({ text: `Discord: ${targetUser.tag}` });

        await interaction.reply({ embeds: [embed] });
    }

    async handleAdminLinkCommand(interaction) {
        // Check admin permissions
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: MESSAGES.ERRORS.ADMIN_REQUIRED,
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('discord_user');
        const t17Username = interaction.options.getString('t17_username');
        const steamId = interaction.options.getString('steam_id');
        const platformOverride = interaction.options.getString('platform');

        // Validate input - need either username or steam ID
        if (!t17Username && !steamId) {
            return await interaction.reply({
                content: '❌ You must provide either a T17 username or Steam ID.',
                ephemeral: true
            });
        }

        // Check if user is already linked
        const existingLink = await this.database.getPlayerByDiscordId(targetUser.id);
        if (existingLink) {
            return await interaction.reply({
                content: `❌ ${targetUser.tag} is already linked to **${existingLink.t17Username}** (${existingLink.steamId}). Use \`/unlink\` first if you want to change accounts.`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            let playerData = null;
            let finalSteamId = steamId;
            let finalUsername = t17Username;
            let detectedPlatform = platformOverride;

            // If Steam ID is provided, use it directly
            if (steamId) {
                // Validate Steam ID format
                if (!this.isValidSteamId(steamId)) {
                    return await interaction.editReply({
                        content: `❌ Invalid Steam ID format: "${steamId}"\n\n**Valid formats:**\n• PC: 76561198123456789\n• Console: da44ad371a9783c49576845d037966f6`
                    });
                }

                // Check if this Steam ID is already linked
                const existingPlayer = await this.database.getPlayerBySteamId(steamId);
                if (existingPlayer) {
                    return await interaction.editReply({
                        content: `❌ Steam ID "${steamId}" is already linked to another Discord user.`
                    });
                }

                // If username wasn't provided, try to find it
                if (!t17Username) {
                    try {
                        const foundPlayer = await this.findPlayerBySteamId(steamId);
                        if (foundPlayer) {
                            finalUsername = foundPlayer.name;
                            Logger.info(`Found username "${finalUsername}" for Steam ID ${steamId}`);
                        } else {
                            finalUsername = `Player_${steamId.substr(-8)}`;
                            Logger.info(`No username found for Steam ID ${steamId}, using generated name: ${finalUsername}`);
                        }
                    } catch (error) {
                        Logger.warn('Could not find username for Steam ID:', error.message);
                        finalUsername = `Player_${steamId.substr(-8)}`;
                    }
                }

                // Auto-detect platform if not provided
                if (!detectedPlatform) {
                    detectedPlatform = this.detectPlatformFromSteamId(steamId);
                }

                playerData = {
                    name: finalUsername,
                    steam_id_64: steamId,
                    display_name: finalUsername
                };

            } else {
                // Use T17 username to find player
                playerData = await this.crcon.getPlayerByT17Username(t17Username);
                
                if (!playerData) {
                    return await interaction.editReply({
                        content: `❌ T17 username "${t17Username}" not found in Hell Let Loose records.\n\n**Make sure:**\n• The player has played on this server recently\n• The T17 username is spelled exactly correct\n• The player is not banned from the server`
                    });
                }

                finalSteamId = playerData.steam_id_64;
                finalUsername = playerData.name;

                // Check if this Steam ID is already linked
                const existingPlayer = await this.database.getPlayerBySteamId(finalSteamId);
                if (existingPlayer) {
                    return await interaction.editReply({
                        content: `❌ The T17 account "${playerData.name}" (${finalSteamId}) is already linked to another Discord user.`
                    });
                }

                // Auto-detect platform if not provided
                if (!detectedPlatform) {
                    detectedPlatform = this.crcon.detectPlatform(playerData);
                }
            }

            // Normalize platform display
            const platformDisplay = this.normalizePlatformDisplay(detectedPlatform);

            // Create the player link
            await this.database.createPlayerLink({
                discordId: targetUser.id,
                t17Username: finalUsername,
                displayName: playerData.display_name || finalUsername,
                steamId: finalSteamId,
                platform: platformDisplay,
                lastSeen: playerData.last_seen || null,
                linkedBy: interaction.user.id,
                adminLinked: true
            });

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor(COLORS.SUCCESS)
                .setTitle('✅ Admin Link Successful!')
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: '👤 Discord User', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
                    { name: '🎮 T17 Username', value: finalUsername, inline: true },
                    { name: '🆔 Steam ID', value: `\`${finalSteamId}\``, inline: true },
                    { name: '🎯 Platform', value: platformDisplay, inline: true },
                    { name: '👨‍💼 Linked By', value: interaction.user.tag, inline: true },
                    { name: '📅 Linked At', value: new Date().toLocaleString(), inline: true }
                )
                .setFooter({ text: 'Player can now use VIP commands!' });

            await interaction.editReply({ embeds: [embed] });

            // Log the admin action
            Logger.info(`Admin link created by ${interaction.user.tag}: ${targetUser.tag} -> ${finalUsername} (${finalSteamId})`);

            // Try to notify the linked user via DM
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setTitle('🔗 Account Linked by Administrator')
                    .setDescription('Your Discord account has been linked to your Hell Let Loose account by a server administrator.')
                    .addFields(
                        { name: '🎮 T17 Username', value: finalUsername, inline: true },
                        { name: '🎯 Platform', value: platformDisplay, inline: true },
                        { name: '📅 Linked At', value: new Date().toLocaleString(), inline: true }
                    )
                    .setFooter({ text: 'You can now use VIP commands! Try /vip to check your status.' });

                await targetUser.send({ embeds: [dmEmbed] });
                Logger.info(`DM notification sent to ${targetUser.tag}`);
            } catch (dmError) {
                Logger.warn(`Failed to send DM to ${targetUser.tag}:`, dmError.message);
            }

        } catch (error) {
            Logger.error('Error in admin link command:', error);
            await interaction.editReply({
                content: `❌ Failed to link account: ${error.message}\n\nThe server might be temporarily unavailable.`
            });
        }
    }

    async handleContestCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: MESSAGES.ERRORS.ADMIN_REQUIRED,
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
                default:
                    await interaction.reply({
                        content: `❌ Unknown contest subcommand: ${subcommand}`,
                        ephemeral: true
                    });
            }
        } catch (error) {
            Logger.error(`Error in contest ${subcommand} command:`, error);
            await interaction.reply({
                content: `❌ Failed to execute contest command: ${error.message}`,
                ephemeral: true
            });
        }
    }

    async handlePanelCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: MESSAGES.ERRORS.ADMIN_REQUIRED,
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle('🎖️ Hell Let Loose VIP Management Panel')
            .setDescription('**Welcome to the VIP system!** Use the buttons below to manage your VIP status and account.')
            .addFields(
                { name: '🔗 **Link Account**', value: 'Connect your Discord to your Hell Let Loose T17 account', inline: true },
                { name: '🎖️ **Check VIP**', value: 'View your current VIP status and expiration', inline: true },
                { name: '👤 **View Profile**', value: 'See your linked account details', inline: true },
                { name: '🏆 **Active Contest**', value: 'Join contests to win VIP time', inline: true },
                { name: '🔓 **Unlink Account**', value: 'Remove the link between accounts', inline: true },
                { name: '❓ **Get Help**', value: 'Instructions and troubleshooting', inline: true }
            )
            .setFooter({ text: 'All data is stored securely and can be removed at any time.' })
            .setTimestamp();

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('panel_link_account')
                    .setLabel('🔗 Link My Account')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('panel_check_vip')
                    .setLabel('🎖️ Check VIP Status')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('panel_view_stats')
                    .setLabel('👤 View Profile')
                    .setStyle(ButtonStyle.Secondary)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('panel_contest')
                    .setLabel('🏆 Active Contest')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('panel_unlink_account')
                    .setLabel('🔓 Unlink Account')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('panel_help')
                    .setLabel('❓ Help & Support')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.reply({
            embeds: [embed],
            components: [row1, row2]
        });
    }

    async handleCreateLeaderboardCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: MESSAGES.ERRORS.ADMIN_REQUIRED,
                ephemeral: true
            });
        }

        const type = interaction.options.getString('type');
        
        await interaction.deferReply();

        try {
            Logger.info(`Creating ${type} leaderboards (daily/weekly/monthly)`);
            
            if (!this.leaderboard) {
                throw new Error('Leaderboard service not available');
            }
            
            // Generate 3 embeds: daily, weekly, monthly for the selected type
            const dailyEmbed = await this.leaderboard.generateLeaderboardEmbed(type, 'daily');
            const weeklyEmbed = await this.leaderboard.generateLeaderboardEmbed(type, 'weekly');
            const monthlyEmbed = await this.leaderboard.generateLeaderboardEmbed(type, 'monthly');
            
            // Create single refresh button
            const refreshButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`leaderboard_refresh_${type}`)
                        .setLabel('🔄 Refresh All')
                        .setStyle(ButtonStyle.Secondary)
                );

            // Send all 3 embeds with the refresh button
            await interaction.editReply({
                embeds: [dailyEmbed, weeklyEmbed, monthlyEmbed],
                components: [refreshButton]
            });

            Logger.info(`${type} leaderboards created successfully in channel ${interaction.channel.id}`);

        } catch (error) {
            Logger.error('Error creating leaderboards:', error);
            await interaction.editReply({
                content: `❌ Failed to create leaderboards: ${error.message}`
            });
        }
    }

    async handleDebugCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: MESSAGES.ERRORS.ADMIN_REQUIRED,
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        
        await interaction.deferReply({ ephemeral: true });

        try {
            switch (subcommand) {
                case 'connection':
                    const connectionTest = await this.crcon.testConnection();
                    const embed = new EmbedBuilder()
                        .setTitle('🔧 CRCON Connection Test')
                        .setColor(connectionTest.connected ? COLORS.SUCCESS : COLORS.ERROR)
                        .addFields(
                            { name: 'Status', value: connectionTest.connected ? '✅ Connected' : '❌ Failed', inline: true },
                            { name: 'Server', value: connectionTest.serverName || 'Unknown', inline: true },
                            { name: 'Players', value: connectionTest.connected ? `${connectionTest.playerCount}/${connectionTest.maxPlayers}` : 'N/A', inline: true }
                        );
                    
                    if (!connectionTest.connected) {
                        embed.addFields({ name: 'Error', value: connectionTest.error, inline: false });
                    }
                    
                    await interaction.editReply({ embeds: [embed] });
                    break;

                case 'vip':
                    const steamId = interaction.options.getString('steam_id');
                    const vipDebug = await this.crcon.debugVipData(steamId);
                    
                    const vipEmbed = new EmbedBuilder()
                        .setTitle('🔧 VIP Data Debug')
                        .setColor(COLORS.INFO)
                        .addFields(
                            { name: 'Steam ID', value: `\`${steamId}\``, inline: false },
                            { name: 'Total VIP Entries', value: vipDebug.totalVipEntries?.toString() || 'Unknown', inline: true }
                        );
                    
                    if (vipDebug.matchingEntry) {
                        vipEmbed.addFields({ name: 'Matching Entry', value: `\`\`\`json\n${JSON.stringify(vipDebug.matchingEntry, null, 2)}\`\`\``, inline: false });
                    } else {
                        vipEmbed.addFields({ name: 'Matching Entry', value: 'None found', inline: false });
                    }
                    
                    await interaction.editReply({ embeds: [vipEmbed] });
                    break;

                case 'player':
                    const username = interaction.options.getString('t17_username');
                    const playerDebug = await this.crcon.debugPlayerSearch(username);
                    
                    const playerEmbed = new EmbedBuilder()
                        .setTitle('🔧 Player Search Debug')
                        .setColor(COLORS.INFO)
                        .addFields(
                            { name: 'Search Term', value: `\`${username}\``, inline: false }
                        );
                    
                    if (playerDebug.endpointResults) {
                        for (const [endpoint, result] of Object.entries(playerDebug.endpointResults)) {
                            const status = result.success ? '✅' : '❌';
                            const info = result.success 
                                ? `${result.count} items (${result.dataType})`
                                : result.error;
                            playerEmbed.addFields({ name: `${status} ${endpoint}`, value: info, inline: true });
                        }
                    }
                    
                    await interaction.editReply({ embeds: [playerEmbed] });
                    break;
            }

        } catch (error) {
            Logger.error('Error in debug command:', error);
            await interaction.editReply({
                content: `❌ Debug command failed: ${error.message}`
            });
        }
    }

    // Helper methods
    isValidSteamId(steamId) {
        if (!steamId || typeof steamId !== 'string') {
            return false;
        }

        // PC Steam ID (17 digits starting with 76561198)
        if (/^76561198\d{9}$/.test(steamId)) {
            return true;
        }

        // Console Steam ID (32 character hex string)
        if (/^[a-f0-9]{32}$/i.test(steamId)) {
            return true;
        }

        // Other numeric Steam IDs
        if (/^\d{17}$/.test(steamId)) {
            return true;
        }

        return false;
    }

    detectPlatformFromSteamId(steamId) {
        if (!steamId) return '🎮 Console';

        // Console players typically have hex Steam IDs
        if (/^[a-f0-9]{32}$/i.test(steamId)) {
            return '🎮 Console';
        }

        // PC Steam IDs start with 76561198
        if (steamId.startsWith('76561198')) {
            return '💻 PC/Steam';
        }

        // PlayStation Steam IDs often start with these patterns
        if (steamId.startsWith('11000') || steamId.startsWith('76561199')) {
            return '🎮 PlayStation';
        }

        return '🎮 Console';
    }

    normalizePlatformDisplay(platform) {
        if (!platform) return '🎮 Console';

        const platformMap = {
            'pc': '💻 PC/Steam',
            'steam': '💻 PC/Steam',
            'ps': '🎮 PlayStation',
            'playstation': '🎮 PlayStation',
            'xbox': '🎮 Xbox',
            'console': '🎮 Console'
        };

        const normalized = platformMap[platform.toLowerCase()] || platform;
        
        // If it already has an emoji, return as-is
        if (normalized.includes('💻') || normalized.includes('🎮')) {
            return normalized;
        }

        // Add default console emoji
        return `🎮 ${normalized}`;
    }

    async findPlayerBySteamId(steamId) {
        try {
            // Try VIP list first (most reliable for finding names)
            const vipIds = await this.crcon.makeRequest('/api/get_vip_ids');
            if (vipIds && Array.isArray(vipIds)) {
                const vipMatch = vipIds.find(vip => 
                    vip && (vip.player_id === steamId || vip.steam_id_64 === steamId)
                );
                if (vipMatch && vipMatch.name) {
                    return { name: vipMatch.name };
                }
            }

            // Try current players
            const currentPlayers = await this.crcon.makeRequest('/api/get_players');
            if (currentPlayers && Array.isArray(currentPlayers)) {
                const onlineMatch = currentPlayers.find(player => 
                    player && (player.player_id === steamId || player.steam_id_64 === steamId)
                );
                if (onlineMatch && onlineMatch.name) {
                    return { name: onlineMatch.name };
                }
            }

            return null;
        } catch (error) {
            Logger.error('Error finding player by Steam ID:', error);
            return null;
        }
    }
}

module.exports = CommandHandler;
