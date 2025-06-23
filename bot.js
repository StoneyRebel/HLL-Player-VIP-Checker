// HLL Player VIP Checker - Discord Bot
// Created by StoneyRebel

require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

console.log('🚀 Starting HLL Player VIP Checker...');
console.log('📁 Project directory:', __dirname);

// Validate environment
if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
    console.error('❌ Missing Discord credentials');
    process.exit(1);
}

// CRCON Authentication check
if (!process.env.CRCON_API_TOKEN && (!process.env.CRCON_USERNAME || !process.env.CRCON_PASSWORD)) {
    console.error('❌ Missing CRCON authentication credentials.');
    console.error('Please provide either:');
    console.error('  - CRCON_API_TOKEN (recommended)');
    console.error('  - Both CRCON_USERNAME and CRCON_PASSWORD');
    process.exit(1);
}

// Configuration
const config = {
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.DISCORD_CLIENT_ID
    },
    crcon: {
        baseUrl: process.env.CRCON_BASE_URL || 'http://localhost:8010',
        apiToken: process.env.CRCON_API_TOKEN,
        username: process.env.CRCON_USERNAME,
        password: process.env.CRCON_PASSWORD,
        timeout: parseInt(process.env.CRCON_TIMEOUT) || 10000
    }
};

// Database paths
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'player_links.json');
const VIP_NOTIFICATIONS_PATH = path.join(DATA_DIR, 'vip_notifications.json');
const CONTEST_PATH = path.join(DATA_DIR, 'contest_data.json');

class HLLPlayerVIPChecker {
    constructor() {
        this.client = new Client({ 
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] 
        });
        
        // Data storage
        this.playerLinks = new Map();
        
        // Contest system
        this.currentContest = null;
        this.contestSubmissions = new Map();
        
        // CRCON authentication
        this.crconToken = null;
        this.crconSessionCookie = null;
        this.tokenExpiry = null;
        
        // VIP notification settings
        this.vipNotificationSettings = {
            enabled: true,
            warningDays: [7, 3, 1],
            lastCheckTime: null,
            sentToday: {}
        };
        
        this.setupEventHandlers();
        this.ensureDataDirectory();
        this.loadDatabase();
        this.loadVipNotificationSettings();
        this.loadContestData();
        this.startVipNotificationScheduler();
    }

    async ensureDataDirectory() {
        try {
            await fs.mkdir(DATA_DIR, { recursive: true });
            console.log('📁 Data directory ready');
        } catch (error) {
            console.error('Error creating data directory:', error);
        }
    }

    setupEventHandlers() {
        this.client.once('ready', async () => {
            console.log(`✅ Bot logged in as ${this.client.user.tag}!`);
            console.log(`🔗 Connected to ${this.client.guilds.cache.size} server(s)`);
            console.log(`🌐 CRCON URL: ${config.crcon.baseUrl}`);
            
            // Add delay and error handling for command registration
            try {
                console.log('🔄 Starting command registration...');
                await this.registerCommands();
            } catch (error) {
                console.error('❌ Command registration failed:', error);
            }
        });

        this.client.on('interactionCreate', async (interaction) => {
            try {
                if (interaction.isChatInputCommand()) {
                    await this.handleSlashCommand(interaction);
                } else if (interaction.isModalSubmit()) {
                    await this.handleModalSubmit(interaction);
                } else if (interaction.isButton()) {
                    await this.handleButtonInteraction(interaction);
                }
            } catch (error) {
                console.error('Error handling interaction:', error);
                await this.handleInteractionError(interaction, error);
            }
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n🛑 Shutting down gracefully...');
            await this.saveDatabase();
            await this.saveVipNotificationSettings();
            await this.saveContestData();
            this.client.destroy();
            process.exit(0);
        });
    }

    async handleInteractionError(interaction, error) {
        const errorMessage = error.message.includes('CRCON') 
            ? '❌ Unable to connect to Hell Let Loose server. Please try again later.'
            : '❌ An error occurred while processing your command.';
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (followUpError) {
            console.error('Failed to send error message:', followUpError);
        }
    }

    async registerCommands() {
        console.log('📝 Building command definitions...');
        
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
                .setDefaultMemberPermissions('0')
        ];

        console.log(`📋 Prepared ${commands.length} commands for registration`);

        try {
            console.log('🔄 Registering slash commands to Discord...');
            
            const result = await this.client.application.commands.set(commands);
            console.log(`✅ Successfully registered ${result.size} commands!`);
            
            // List registered commands
            result.forEach(cmd => {
                console.log(`  ✓ /${cmd.name}`);
            });
            
        } catch (error) {
            console.error('❌ Error registering commands:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                status: error.status
            });
            
            // Don't throw - let bot continue running
        }
    }

    async handleSlashCommand(interaction) {
        const { commandName } = interaction;
        
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
            default:
                await interaction.reply({
                    content: '❌ Unknown command.',
                    ephemeral: true
                });
        }
    }

    // ADVANCED LINKING SYSTEM FROM UPLOADED CODE
    async handleLinkCommand(interaction) {
        const t17Username = interaction.options.getString('username').trim();
        const discordId = interaction.user.id;

        // Check if already linked
        if (this.playerLinks.has(discordId)) {
            const existingLink = this.playerLinks.get(discordId);
            return await interaction.reply({
                content: `❌ You're already linked to **${existingLink.t17Username}**. Use \`/unlink\` first if you want to change accounts.`,
                ephemeral: true
            });
        }

        // Validate username length
        if (t17Username.length < 2 || t17Username.length > 50) {
            return await interaction.reply({
                content: '❌ Invalid T17 username length. Please provide your exact T17 username (2-50 characters).',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Use advanced CRCON verification
            const playerData = await this.getPlayerByT17Username(t17Username);
            
            if (!playerData) {
                return await interaction.editReply({
                    content: `❌ T17 username "${t17Username}" not found in Hell Let Loose records.\n\n**Make sure:**\n• You've played on this server recently\n• Your T17 username is spelled exactly correct\n• You're not banned from the server\n\n**How to find your T17 username:**\n• In-game: Check your profile or scoreboard\n• Console: It's your cross-platform username\n• PC: Usually your Steam name or custom T17 name`
                });
            }

            // Check for duplicate Steam IDs
            const existingDiscordUser = [...this.playerLinks.entries()]
                .find(([_, data]) => data.steamId === playerData.steam_id_64);
            
            if (existingDiscordUser) {
                return await interaction.editReply({
                    content: `❌ The T17 account "${playerData.name}" is already linked to another Discord user.`
                });
            }

            // Save the link with full data
            this.playerLinks.set(discordId, {
                t17Username: playerData.name,
                displayName: playerData.display_name || playerData.name,
                linkedAt: new Date().toISOString(),
                steamId: playerData.steam_id_64,
                platform: this.detectPlatform(playerData),
                lastSeen: playerData.last_seen
            });

            await this.saveDatabase();

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Account Linked Successfully!')
                .addFields(
                    { name: '🎮 T17 Username', value: playerData.name, inline: true },
                    { name: '🎯 Platform', value: this.detectPlatform(playerData), inline: true },
                    { name: '📅 Linked At', value: new Date().toLocaleString(), inline: true }
                );

            if (playerData.display_name && playerData.display_name !== playerData.name) {
                embed.addFields({ name: '📝 Display Name', value: playerData.display_name, inline: true });
            }

            if (playerData.steam_id_64) {
                embed.addFields({ name: '🆔 Steam ID', value: `||${playerData.steam_id_64}||`, inline: true });
            }

            if (playerData.last_seen) {
                embed.addFields({ name: '👁️ Last Seen', value: new Date(playerData.last_seen).toLocaleString(), inline: true });
            }

            embed.setFooter({ text: 'You can now use /vip to check your VIP status!' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error linking account:', error);
            await interaction.editReply({
                content: '❌ Failed to link account. The server might be temporarily unavailable. Please try again later.'
            });
        }
    }

    // ADVANCED CRCON PLAYER SEARCH (Multi-method verification)
    async getPlayerByT17Username(t17Username) {
        try {
            // Method 1: Try get_playerids (complete player database)
            try {
                const playerIds = await this.makeAuthenticatedRequest('/api/get_playerids');
                
                if (playerIds && Array.isArray(playerIds)) {
                    const exactMatch = playerIds.find(([name, steamId]) => 
                        name.toLowerCase() === t17Username.toLowerCase()
                    );
                    
                    if (exactMatch) {
                        return {
                            name: exactMatch[0],
                            steam_id_64: exactMatch[1],
                            display_name: exactMatch[0]
                        };
                    }
                }
            } catch (error) {
                console.log('Method 1 (playerids) failed, trying method 2...');
            }

            // Method 2: Try current online players
            try {
                const currentPlayers = await this.makeAuthenticatedRequest('/api/get_players');
                
                if (currentPlayers && Array.isArray(currentPlayers)) {
                    const onlineMatch = currentPlayers.find(player => 
                        player.name && player.name.toLowerCase() === t17Username.toLowerCase()
                    );
                    
                    if (onlineMatch) {
                        return {
                            name: onlineMatch.name,
                            steam_id_64: onlineMatch.player_id,
                            display_name: onlineMatch.name
                        };
                    }
                }
            } catch (error) {
                console.log('Method 2 (current players) failed, trying method 3...');
            }

            // Method 3: Try VIP list (guaranteed real players)
            try {
                const vipIds = await this.makeAuthenticatedRequest('/api/get_vip_ids');
                
                if (vipIds && Array.isArray(vipIds)) {
                    const vipMatch = vipIds.find(vip => 
                        vip.name && vip.name.toLowerCase() === t17Username.toLowerCase()
                    );
                    
                    if (vipMatch) {
                        return {
                            name: vipMatch.name,
                            steam_id_64: vipMatch.player_id,
                            display_name: vipMatch.name
                        };
                    }
                }
            } catch (error) {
                console.log('Method 3 (VIP list) failed');
            }

            return null;

        } catch (error) {
            console.error('Error fetching player by T17 username:', error.message);
            throw new Error('Failed to search for T17 username in CRCON');
        }
    }

    // SMART PLATFORM DETECTION
    detectPlatform(playerData) {
        if (!playerData.steam_id_64) {
            return '🎮 Console';
        }
        
        const steamId = playerData.steam_id_64;
        const t17Username = playerData.name ? playerData.name.toLowerCase() : '';
        
        // PlayStation patterns
        if (steamId.startsWith('11000') || steamId.startsWith('76561199')) {
            return '🎮 PlayStation';
        }
        
        // Check username patterns for platform hints
        if (t17Username.includes('ps4') || t17Username.includes('ps5') || 
            t17Username.includes('psn') || t17Username.includes('playstation')) {
            return '🎮 PlayStation';
        }
        
        if (t17Username.includes('xbox') || t17Username.includes('xbl') || 
            t17Username.includes('gt:') || t17Username.startsWith('xbox')) {
            return '🎮 Xbox';
        }
        
        // Steam/PC patterns (most common)
        if (steamId.startsWith('76561198')) {
            // Additional checks for Xbox players using Steam IDs
            if (t17Username.match(/^[a-z]+\d+$/) && t17Username.length > 15) {
                return '🎮 Xbox';
            }
            return '💻 PC/Steam';
        }
        
        return '🎮 Console';
    }

    async handleVipCommand(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const targetId = targetUser.id;

        if (!this.playerLinks.has(targetId)) {
            const message = targetUser.id === interaction.user.id 
                ? '❌ You haven\'t linked your Hell Let Loose account yet. Use `/link` to get started!'
                : '❌ That user hasn\'t linked their Hell Let Loose account yet.';
            
            return await interaction.reply({ content: message, ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const linkedData = this.playerLinks.get(targetId);
            const vipData = await this.getVipStatus(linkedData.steamId);

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

            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`lifetime_stats_${targetUser.id}`)
                        .setLabel('📊 Lifetime Stats')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`recent_activity_${targetUser.id}`)
                        .setLabel('📈 Recent Activity')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.editReply({ embeds: [embed], components: [actionRow] });

        } catch (error) {
            console.error('Error checking VIP status:', error);
            await interaction.editReply({
                content: '❌ Failed to check VIP status. The server might be temporarily unavailable.'
            });
        }
    }

    async getVipStatus(steamId) {
        try {
            const vipIds = await this.makeAuthenticatedRequest('/api/get_vip_ids');

            if (vipIds && Array.isArray(vipIds)) {
                const vipEntry = vipIds.find(vip => vip.player_id === steamId);
                
                if (vipEntry) {
                    if (vipEntry.expiration) {
                        const expirationDate = new Date(vipEntry.expiration);
                        const now = new Date();
                        const daysRemaining = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));

                        return {
                            isVip: daysRemaining > 0,
                            expirationDate: expirationDate.toLocaleDateString(),
                            daysRemaining: Math.max(0, daysRemaining),
                            description: vipEntry.description || 'VIP Player'
                        };
                    } else {
                        return {
                            isVip: true,
                            expirationDate: 'Never',
                            daysRemaining: null,
                            description: vipEntry.description || 'Permanent VIP'
                        };
                    }
                }
            }

            return { isVip: false };

        } catch (error) {
            console.error('Error fetching VIP status:', error.message);
            return { isVip: false };
        }
    }

    async handleUnlinkCommand(interaction) {
        const discordId = interaction.user.id;

        if (!this.playerLinks.has(discordId)) {
            return await interaction.reply({
                content: '❌ You don\'t have any linked Hell Let Loose account.',
                ephemeral: true
            });
        }

        const linkedData = this.playerLinks.get(discordId);
        this.playerLinks.delete(discordId);
        await this.saveDatabase();

        const embed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle('🔓 Account Unlinked')
            .setDescription(`Your Discord account has been unlinked from T17 username **${linkedData.t17Username}**.`)
            .setFooter({ text: 'You can link a new account anytime with /link' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handleProfileCommand(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const targetId = targetUser.id;

        if (!this.playerLinks.has(targetId)) {
            const message = targetUser.id === interaction.user.id 
                ? '❌ You haven\'t linked your Hell Let Loose account yet. Use `/link` to get started!'
                : '❌ That user hasn\'t linked their Hell Let Loose account yet.';
            
            return await interaction.reply({ content: message, ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const linkedData = this.playerLinks.get(targetId);

            const embed = new EmbedBuilder()
                .setTitle(`👤 Hell Let Loose Profile`)
                .setColor(0x4CAF50)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: '🎮 T17 Username', value: linkedData.t17Username, inline: true },
                    { name: '🎯 Platform', value: linkedData.platform, inline: true },
                    { name: '🔗 Linked Since', value: new Date(linkedData.linkedAt).toLocaleDateString(), inline: true }
                );

            if (linkedData.displayName && linkedData.displayName !== linkedData.t17Username) {
                embed.addFields({ name: '📝 Display Name', value: linkedData.displayName, inline: true });
            }

            if (linkedData.steamId) {
                embed.addFields({ name: '🆔 Steam ID', value: `||${linkedData.steamId}||`, inline: true });
            }

            if (linkedData.lastSeen) {
                embed.addFields({ name: '👁️ Last Seen', value: new Date(linkedData.lastSeen).toLocaleString(), inline: true });
            }

            embed.setFooter({ text: `Discord: ${targetUser.tag}` });

            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`lifetime_stats_${targetId}`)
                        .setLabel('📊 Lifetime Stats')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`recent_activity_${targetId}`)
                        .setLabel('📈 Recent Activity')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.editReply({ embeds: [embed], components: [actionRow] });

        } catch (error) {
            console.error('Error fetching profile:', error);
            await interaction.editReply({
                content: '❌ Failed to fetch profile data. The server might be temporarily unavailable.'
            });
        }
    }

    async handleStatusCommand(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const crconStatus = await this.testCRCONConnection();
            
            const embed = new EmbedBuilder()
                .setTitle(`🤖 Bot Status`)
                .setColor(crconStatus.connected ? 0x00FF00 : 0xFF0000)
                .addFields(
                    { name: '🟢 Bot Status', value: 'Online', inline: true },
                    { name: '📊 Linked Players', value: this.playerLinks.size.toString(), inline: true },
                    { name: '🌐 CRCON Connection', value: crconStatus.connected ? '🟢 Connected' : '🔴 Disconnected', inline: true },
                    { name: '🔗 CRCON URL', value: config.crcon.baseUrl, inline: true }
                );

            if (crconStatus.connected && crconStatus.serverName) {
                embed.addFields(
                    { name: '🎮 Server Name', value: crconStatus.serverName, inline: true },
                    { name: '👥 Players Online', value: `${crconStatus.playerCount}/${crconStatus.maxPlayers}`, inline: true }
                );
            }

            // Add contest status
            if (this.currentContest) {
                const contestStatus = this.currentContest.active ? '🟢 Active' : '🔴 Ended';
                embed.addFields({ name: '🏆 Contest Status', value: contestStatus, inline: true });
            }

            if (crconStatus.error) {
                embed.addFields({ name: '❌ Error Details', value: crconStatus.error, inline: false });
            }

            embed.setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply({
                content: '❌ Failed to check status. Please try again later.'
            });
        }
    }

    async testCRCONConnection() {
        try {
            const status = await this.makeAuthenticatedRequest('/api/get_status');
            
            if (status) {
                return { 
                    connected: true, 
                    serverName: status.name || 'Unknown',
                    playerCount: status.player_count || 0,
                    maxPlayers: status.player_count_max || 0
                };
            }
            
            return { connected: false, error: 'No response from CRCON' };
        } catch (error) {
            return { 
                connected: false, 
                error: error.message 
            };
        }
    }

    async handleAdminLinkCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('discord_user');
        const t17Username = interaction.options.getString('t17_username').trim();

        if (this.playerLinks.has(targetUser.id)) {
            const existingLink = this.playerLinks.get(targetUser.id);
            return await interaction.reply({
                content: `❌ ${targetUser.tag} is already linked to **${existingLink.t17Username}**. Use \`/unlink\` on their account first if you want to change it.`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const playerData = await this.getPlayerByT17Username(t17Username);

            if (!playerData) {
                return await interaction.editReply({
                    content: `❌ T17 username "${t17Username}" not found in Hell Let Loose records.`
                });
            }

            const existingDiscordUser = [...this.playerLinks.entries()]
                .find(([_, data]) => data.steamId === playerData.steam_id_64);

            if (existingDiscordUser) {
                const existingUser = await this.client.users.fetch(existingDiscordUser[0]);
                return await interaction.editReply({
                    content: `❌ The T17 account "${playerData.name}" is already linked to ${existingUser.tag}.`
                });
            }

            this.playerLinks.set(targetUser.id, {
                t17Username: playerData.name,
                displayName: playerData.display_name || playerData.name,
                linkedAt: new Date().toISOString(),
                steamId: playerData.steam_id_64,
                platform: this.detectPlatform(playerData),
                lastSeen: playerData.last_seen,
                linkedBy: interaction.user.id,
                adminLinked: true
            });

            await this.saveDatabase();

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Admin Link Successful!')
                .addFields(
                    { name: '👤 Discord User', value: `${targetUser.tag}`, inline: false },
                    { name: '🎮 T17 Username', value: playerData.name, inline: true },
                    { name: '🎯 Platform', value: this.detectPlatform(playerData), inline: true },
                    { name: '👨‍💼 Linked By', value: interaction.user.tag, inline: true }
                );

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in admin link command:', error);
            await interaction.editReply({
                content: '❌ Failed to link account. Please try again later.'
            });
        }
    }

    async handleVipNotifyCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const warningDays = interaction.options.getInteger('warning_days');
        const enabled = interaction.options.getBoolean('enabled');

        if (warningDays !== null) {
            this.vipNotificationSettings.warningDays = [warningDays, Math.max(1, warningDays - 3), 1]
                .filter((v, i, a) => a.indexOf(v) === i && v > 0)
                .sort((a, b) => b - a);
        }

        if (enabled !== null) {
            this.vipNotificationSettings.enabled = enabled;
        }

        await this.saveVipNotificationSettings();

        const embed = new EmbedBuilder()
            .setColor(this.vipNotificationSettings.enabled ? 0x00FF00 : 0xFF6B6B)
            .setTitle('🔔 VIP Notification Settings')
            .addFields(
                { name: '📊 Status', value: this.vipNotificationSettings.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: '⏰ Warning Days', value: this.vipNotificationSettings.warningDays.join(', '), inline: true }
            );

        await interaction.reply({ embeds: [embed], ephemeral: true });
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
            console.error('Error creating VIP panel:', error);
            await interaction.reply({
                content: '❌ Failed to create VIP panel.',
                ephemeral: true
            });
        }
    }

    // CONTEST SYSTEM
    async handleContestCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'create':
                await this.handleContestCreate(interaction);
                break;
            case 'end':
                await this.handleContestEnd(interaction);
                break;
            case 'winners':
                await this.handleContestWinners(interaction);
                break;
            case 'status':
                await this.handleContestStatus(interaction);
                break;
        }
    }

    async handleContestCreate(interaction) {
        if (this.currentContest && this.currentContest.active) {
            return await interaction.reply({
                content: '❌ There is already an active contest. End it first with `/contest end`.',
                ephemeral: true
            });
        }

        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const durationHours = interaction.options.getInteger('duration_hours');
        const prize = interaction.options.getString('prize');
        const maxWinners = interaction.options.getInteger('max_winners') || 1;

        await interaction.deferReply({ ephemeral: true });

        try {
            const startTime = new Date();
            const endTime = new Date(startTime.getTime() + (durationHours * 60 * 60 * 1000));

            this.currentContest = {
                id: `contest_${Date.now()}`,
                title,
                description,
                prize,
                maxWinners,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                createdBy: interaction.user.id,
                active: true
            };

            this.contestSubmissions.clear();
            await this.saveContestData();

            // Send in-game announcement
            const inGameMessage = `🏆 NEW VIP CONTEST: ${title} | Prize: ${prize} | Duration: ${durationHours}h | Join our Discord to participate!`;
            
            try {
                await this.sendMessageToAllPlayers(inGameMessage);
            } catch (error) {
                console.error('Failed to send in-game announcement:', error);
                // Continue anyway
            }

            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🏆 Contest Created Successfully!')
                .addFields(
                    { name: '📝 Title', value: title, inline: false },
                    { name: '📄 Description', value: description, inline: false },
                    { name: '🎁 Prize', value: prize, inline: true },
                    { name: '👑 Max Winners', value: maxWinners.toString(), inline: true },
                    { name: '⏰ Duration', value: `${durationHours} hours`, inline: true },
                    { name: '🏁 Ends At', value: endTime.toLocaleString(), inline: true }
                )
                .setFooter({ text: 'Contest announcement sent to all players in-game!' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error creating contest:', error);
            await interaction.editReply({
                content: '❌ Failed to create contest. Please try again later.'
            });
        }
    }

    async handleContestEnd(interaction) {
        if (!this.currentContest) {
            return await interaction.reply({
                content: '❌ No active contest to end.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const submissionCount = this.contestSubmissions.size;
            
            this.currentContest.active = false;
            this.currentContest.endedAt = new Date().toISOString();
            this.currentContest.endedBy = interaction.user.id;

            await this.saveContestData();

            // Send in-game announcement
            try {
                await this.sendMessageToAllPlayers(`🏆 Contest "${this.currentContest.title}" has ended! Check Discord for results.`);
            } catch (error) {
                console.error('Failed to send end announcement:', error);
            }

            const embed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle('🏁 Contest Ended')
                .addFields(
                    { name: '📝 Contest', value: this.currentContest.title, inline: false },
                    { name: '📊 Total Submissions', value: submissionCount.toString(), inline: true },
                    { name: '⏰ Ended At', value: new Date().toLocaleString(), inline: true }
                )
                .setFooter({ text: 'Use /contest winners to select winners' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error ending contest:', error);
            await interaction.editReply({
                content: '❌ Failed to end contest. Please try again later.'
            });
        }
    }

    async handleContestWinners(interaction) {
        if (!this.currentContest) {
            return await interaction.reply({
                content: '❌ No contest available for winner selection.',
                ephemeral: true
            });
        }

        const winnerIdsString = interaction.options.getString('winner_ids');
        const winnerIds = winnerIdsString.split(',').map(id => id.trim());

        if (winnerIds.length > this.currentContest.maxWinners) {
            return await interaction.reply({
                content: `❌ Too many winners selected. Maximum allowed: ${this.currentContest.maxWinners}`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const winners = [];
            
            for (const winnerId of winnerIds) {
                try {
                    const user = await this.client.users.fetch(winnerId);
                    winners.push({
                        id: winnerId,
                        tag: user.tag
                    });

                    // Send DM to winner
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0xFFD700)
                        .setTitle('🎉 Congratulations! You Won!')
                        .addFields(
                            { name: '🏆 Contest', value: this.currentContest.title, inline: false },
                            { name: '🎁 Prize', value: this.currentContest.prize, inline: true }
                        )
                        .setFooter({ text: 'Contact a server administrator to claim your prize!' });

                    await user.send({ embeds: [dmEmbed] });

                } catch (error) {
                    console.error(`Failed to process winner ${winnerId}:`, error);
                }
            }

            // Send in-game announcement
            const winnerTags = winners.map(w => w.tag).join(', ');
            try {
                await this.sendMessageToAllPlayers(`🎉 Contest winners: ${winnerTags}! Congratulations!`);
            } catch (error) {
                console.error('Failed to send winner announcement:', error);
            }

            this.currentContest.winners = winners;
            this.currentContest.winnersSelectedAt = new Date().toISOString();
            this.currentContest.winnersSelectedBy = interaction.user.id;
            await this.saveContestData();

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🎉 Contest Winners Selected!')
                .addFields(
                    { name: '🏆 Contest', value: this.currentContest.title, inline: false },
                    { name: '👑 Winners', value: winnerTags, inline: false },
                    { name: '🎁 Prize', value: this.currentContest.prize, inline: true }
                )
                .setFooter({ text: 'Winners have been notified via DM and in-game announcement sent!' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error selecting winners:', error);
            await interaction.editReply({
                content: '❌ Failed to select winners. Please try again later.'
            });
        }
    }

    async handleContestStatus(interaction) {
        if (!this.currentContest) {
            return await interaction.reply({
                content: '❌ No contest data available.',
                ephemeral: true
            });
        }

        const now = new Date();
        const endTime = new Date(this.currentContest.endTime);
        const timeLeft = this.currentContest.active ? Math.max(0, Math.ceil((endTime - now) / (1000 * 60 * 60))) : 0;
        
        const embed = new EmbedBuilder()
            .setColor(this.currentContest.active ? 0x00FF00 : 0x808080)
            .setTitle(`🏆 Contest Status: ${this.currentContest.title}`)
            .addFields(
                { name: '📄 Description', value: this.currentContest.description, inline: false },
                { name: '🎁 Prize', value: this.currentContest.prize, inline: true },
                { name: '📊 Status', value: this.currentContest.active ? '🟢 Active' : '🔴 Ended', inline: true },
                { name: '👑 Max Winners', value: this.currentContest.maxWinners.toString(), inline: true },
                { name: '📝 Submissions', value: this.contestSubmissions.size.toString(), inline: true }
            );

        if (this.currentContest.active && timeLeft > 0) {
            embed.addFields({ name: '⏰ Time Remaining', value: `${timeLeft} hours`, inline: true });
        }

        if (this.currentContest.winners) {
            const winnerList = this.currentContest.winners.map(w => w.tag).join('\n');
            embed.addFields({ name: '👑 Winners', value: winnerList, inline: false });
        }

        embed.setFooter({ 
            text: `Started: ${new Date(this.currentContest.startTime).toLocaleString()}`
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async sendMessageToAllPlayers(message) {
        try {
            await this.makeAuthenticatedRequest('/api/do_message_players', 'POST', {
                message: message,
                player_name: 'Contest System'
            });
            console.log('📢 Sent in-game message to all players');
        } catch (error) {
            console.error('Failed to send message to players:', error);
            throw error;
        }
    }

    async handleButtonInteraction(interaction) {
        if (interaction.customId.startsWith('panel_')) {
            await this.handleVipPanelButtons(interaction);
        } else if (interaction.customId.startsWith('lifetime_stats_')) {
            await this.handleStatsButton(interaction, 'lifetime');
        } else if (interaction.customId.startsWith('recent_activity_')) {
            await this.handleStatsButton(interaction, 'recent');
        }
    }

    async handleVipPanelButtons(interaction) {
        switch (interaction.customId) {
            case 'panel_link_account':
                await this.showLinkModal(interaction);
                break;
            case 'panel_check_vip':
                await this.handlePanelCheckVip(interaction);
                break;
            case 'panel_view_stats':
                await this.handlePanelViewStats(interaction);
                break;
            case 'panel_contest':
                await this.handlePanelContest(interaction);
                break;
            case 'panel_unlink_account':
                await this.handlePanelUnlink(interaction);
                break;
            case 'panel_help':
                await this.handlePanelHelp(interaction);
                break;
        }
    }

    async showLinkModal(interaction) {
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
    }

    async handleModalSubmit(interaction) {
        if (interaction.customId === 'link_account_modal') {
            const t17Username = interaction.fields.getTextInputValue('t17_username_input').trim();
            
            // Temporarily modify interaction to work with existing link handler
            interaction.options = {
                getString: (name) => name === 'username' ? t17Username : null
            };
            
            await this.handleLinkCommand(interaction);
        }
    }

    async handlePanelCheckVip(interaction) {
        // Temporarily modify interaction to work with existing VIP handler
        interaction.options = {
            getUser: () => null
        };
        
        await this.handleVipCommand(interaction);
    }

    async handlePanelViewStats(interaction) {
        // Temporarily modify interaction to work with existing profile handler
        interaction.options = {
            getUser: () => null
        };
        
        await this.handleProfileCommand(interaction);
    }

    async handlePanelContest(interaction) {
        if (!this.currentContest) {
            return await interaction.reply({
                content: '❌ No active contest at the moment. Check back later!',
                ephemeral: true
            });
        }

        const now = new Date();
        const endTime = new Date(this.currentContest.endTime);
        const timeLeft = this.currentContest.active ? Math.max(0, Math.ceil((endTime - now) / (1000 * 60 * 60))) : 0;

        const embed = new EmbedBuilder()
            .setColor(this.currentContest.active ? 0xFFD700 : 0x808080)
            .setTitle(`🏆 Current Contest: ${this.currentContest.title}`)
            .addFields(
                { name: '📄 How to Enter', value: this.currentContest.description, inline: false },
                { name: '🎁 Prize', value: this.currentContest.prize, inline: true },
                { name: '📊 Status', value: this.currentContest.active ? '🟢 Active' : '🔴 Ended', inline: true }
            );

        if (this.currentContest.active && timeLeft > 0) {
            embed.addFields({ name: '⏰ Time Remaining', value: `${timeLeft} hours`, inline: true });
        }

        if (this.currentContest.winners) {
            const winnerList = this.currentContest.winners.map(w => w.tag).join('\n');
            embed.addFields({ name: '👑 Winners', value: winnerList, inline: false });
        } else if (!this.currentContest.active) {
            embed.addFields({ name: '👑 Winners', value: 'To be announced soon!', inline: false });
        }

        embed.setFooter({ text: 'Good luck and have fun!' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handlePanelUnlink(interaction) {
        await this.handleUnlinkCommand(interaction);
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

    async handleStatsButton(interaction, type) {
        await interaction.reply({
            content: `📊 ${type === 'lifetime' ? 'Lifetime stats' : 'Recent activity'} feature coming soon!`,
            ephemeral: true
        });
    }

    // VIP NOTIFICATION SYSTEM
    startVipNotificationScheduler() {
        // Check every hour
        setInterval(async () => {
            if (this.vipNotificationSettings.enabled) {
                await this.checkVipExpirations();
            }
        }, 60 * 60 * 1000);

        // Initial check after 30 seconds
        setTimeout(async () => {
            if (this.vipNotificationSettings.enabled) {
                console.log('🔔 Running initial VIP expiration check...');
                await this.checkVipExpirations();
            }
        }, 30000);
    }

    async checkVipExpirations() {
        try {
            console.log('🔍 Checking VIP expirations...');
            
            const vipIds = await this.makeAuthenticatedRequest('/api/get_vip_ids');
            
            if (!vipIds || !Array.isArray(vipIds)) {
                console.log('No VIP data received from CRCON');
                return;
            }

            const now = new Date();
            let notificationsSent = 0;

            for (const vip of vipIds) {
                if (!vip.expiration || !vip.player_id) continue;

                const expirationDate = new Date(vip.expiration);
                const daysUntilExpiry = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));

                if (this.vipNotificationSettings.warningDays.includes(daysUntilExpiry)) {
                    const linkedDiscordUser = [...this.playerLinks.entries()]
                        .find(([_, data]) => data.steamId === vip.player_id);

                    if (linkedDiscordUser) {
                        const [discordId, playerData] = linkedDiscordUser;
                        await this.sendVipExpirationNotification(discordId, playerData, daysUntilExpiry, expirationDate);
                        notificationsSent++;
                    }
                }
            }

            this.vipNotificationSettings.lastCheckTime = now.toISOString();
            await this.saveVipNotificationSettings();

            if (notificationsSent > 0) {
                console.log(`✅ Sent ${notificationsSent} VIP expiration notifications`);
            }

        } catch (error) {
            console.error('Error checking VIP expirations:', error);
        }
    }

    async sendVipExpirationNotification(discordId, playerData, daysRemaining, expirationDate) {
        try {
            const user = await this.client.users.fetch(discordId);
            
            const urgencyColor = daysRemaining <= 1 ? 0xFF0000 : daysRemaining <= 3 ? 0xFF8C00 : 0xFFD700;
            const urgencyEmoji = daysRemaining <= 1 ? '🚨' : daysRemaining <= 3 ? '⚠️' : '🔔';
            
            const embed = new EmbedBuilder()
                .setColor(urgencyColor)
                .setTitle(`${urgencyEmoji} VIP Expiration Notice`)
                .setDescription(`Your VIP status is expiring soon!`)
                .addFields(
                    { name: '🎮 Player', value: playerData.t17Username, inline: true },
                    { name: '⏰ Expires', value: expirationDate.toLocaleDateString(), inline: true },
                    { name: '📅 Days Remaining', value: daysRemaining.toString(), inline: true }
                )
                .setFooter({ text: 'Contact a server administrator to renew your VIP status' });

            await user.send({ embeds: [embed] });
            console.log(`📨 Sent VIP expiration notice to ${user.tag} (${daysRemaining} days remaining)`);

        } catch (error) {
            console.error(`Failed to send VIP notification to user ${discordId}:`, error.message);
        }
    }

    // CRCON AUTHENTICATION SYSTEM
    async authenticateCRCON() {
        if (config.crcon.apiToken) {
            this.crconToken = config.crcon.apiToken;
            this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            return true;
        }

        if (!config.crcon.username || !config.crcon.password) {
            throw new Error('No CRCON authentication method available');
        }

        if (this.crconToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
            return true;
        }

        try {
            const response = await axios.post(`${config.crcon.baseUrl}/api/login`, {
                username: config.crcon.username,
                password: config.crcon.password
            }, {
                timeout: config.crcon.timeout,
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.headers['set-cookie']) {
                this.crconSessionCookie = response.headers['set-cookie'][0];
                this.tokenExpiry = new Date(Date.now() + 25 * 60 * 1000);
                console.log('✅ CRCON session authentication successful');
                return true;
            } else if (response.data && response.data.access_token) {
                this.crconToken = response.data.access_token;
                this.tokenExpiry = new Date(Date.now() + 25 * 60 * 1000);
                console.log('✅ CRCON JWT authentication successful');
                return true;
            }
            
            throw new Error('No valid authentication response received');
            
        } catch (error) {
            console.error('❌ CRCON authentication failed:', error.message);
            throw new Error(`CRCON authentication failed: ${error.message}`);
        }
    }

    async makeAuthenticatedRequest(endpoint, method = 'GET', data = null) {
        if (!this.crconToken && !this.crconSessionCookie) {
            await this.authenticateCRCON();
        }

        try {
            const requestConfig = {
                method,
                url: `${config.crcon.baseUrl}${endpoint}`,
                headers: { 'Content-Type': 'application/json' },
                timeout: config.crcon.timeout
            };

            // Set authentication
            if (config.crcon.apiToken) {
                requestConfig.headers['Authorization'] = `Bearer ${this.crconToken}`;
            } else if (this.crconSessionCookie) {
                requestConfig.headers['Cookie'] = this.crconSessionCookie;
            } else if (this.crconToken) {
                requestConfig.headers['Authorization'] = `Bearer ${this.crconToken}`;
            }

            // Handle request data
            if (method === 'POST' && data) {
                requestConfig.data = data;
            } else if (method === 'GET' && data) {
                const params = new URLSearchParams(data);
                requestConfig.url += `?${params.toString()}`;
            }

            const response = await axios(requestConfig);
            
            // Handle CRCON response format
            if (response.data && typeof response.data === 'object' && 'result' in response.data) {
                return response.data.result;
            }
            
            return response.data;

        } catch (error) {
            // Handle authentication expiry
            if (error.response?.status === 401 && !config.crcon.apiToken) {
                console.log('🔄 Authentication expired, re-authenticating...');
                this.crconToken = null;
                this.crconSessionCookie = null;
                this.tokenExpiry = null;
                await this.authenticateCRCON();
                return this.makeAuthenticatedRequest(endpoint, method, data);
            }
            
            console.error(`CRCON API Error [${method} ${endpoint}]:`, error.message);
            throw error;
        }
    }

    // DATABASE MANAGEMENT
    async loadDatabase() {
        try {
            const data = await fs.readFile(DB_PATH, 'utf8');
            const parsed = JSON.parse(data);
            this.playerLinks = new Map(Object.entries(parsed));
            console.log(`📂 Loaded ${this.playerLinks.size} player links`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error loading database:', error);
            }
            this.playerLinks = new Map();
            console.log('📂 Starting with empty database');
        }
    }

    async saveDatabase() {
        try {
            const data = Object.fromEntries(this.playerLinks);
            await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
            console.log(`💾 Saved ${this.playerLinks.size} player links`);
        } catch (error) {
            console.error('Error saving database:', error);
        }
    }

    async loadVipNotificationSettings() {
        try {
            const data = await fs.readFile(VIP_NOTIFICATIONS_PATH, 'utf8');
            const loaded = JSON.parse(data);
            this.vipNotificationSettings = { ...this.vipNotificationSettings, ...loaded };
            console.log('📂 Loaded VIP notification settings');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error loading VIP notification settings:', error);
            }
            console.log('📂 Using default VIP notification settings');
        }
    }

    async saveVipNotificationSettings() {
        try {
            await fs.writeFile(VIP_NOTIFICATIONS_PATH, JSON.stringify(this.vipNotificationSettings, null, 2));
        } catch (error) {
            console.error('Error saving VIP notification settings:', error);
        }
    }

    async loadContestData() {
        try {
            const data = await fs.readFile(CONTEST_PATH, 'utf8');
            const parsed = JSON.parse(data);
            
            this.currentContest = parsed.currentContest || null;
            this.contestSubmissions = new Map(Object.entries(parsed.submissions || {}));
            
            console.log('📂 Loaded contest data');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error loading contest data:', error);
            }
            this.currentContest = null;
            this.contestSubmissions = new Map();
            console.log('📂 Using default contest settings');
        }
    }

    async saveContestData() {
        try {
            const contestData = {
                currentContest: this.currentContest,
                submissions: Object.fromEntries(this.contestSubmissions)
            };
            await fs.writeFile(CONTEST_PATH, JSON.stringify(contestData, null, 2));
            console.log('💾 Saved contest data');
        } catch (error) {
            console.error('Error saving contest data:', error);
        }
    }

    async start() {
        try {
            console.log('🌐 CRCON URL:', config.crcon.baseUrl);
            console.log('✅ Bot initialization complete');
            await this.client.login(config.discord.token);
        } catch (error) {
            console.error('❌ Failed to start bot:', error);
            process.exit(1);
        }
    }
}

// Start the bot
const bot = new HLLPlayerVIPChecker();
bot.start();
