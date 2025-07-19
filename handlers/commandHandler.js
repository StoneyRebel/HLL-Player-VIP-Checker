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
                    .setName('debug')
                    .setDescription('Debug CRCON connection and data (Admin only)')
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('connection')
                            .setDescription('Test CRCON connection')
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
            ];

            const rest = new REST({ version: '10' }).setToken(config.discord.token);

            Logger.info(`🔄 Registering ${this.commands.length} commands...`);
            
            const data = await rest.put(
                Routes.applicationCommands(config.discord.clientId),
                { body: this.commands.map(command => command.toJSON()) }
            );

            Logger.info('✅ Successfully registered all commands!');

        } catch (error) {
            Logger.error('❌ Failed to register commands:', error);
        }
    }

    async handleCommand(interaction) {
        const { commandName } = interaction;

        try {
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
                case 'debug':
                    await this.handleDebugCommand(interaction);
                    break;
                default:
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
                content: `❌ You're already linked to **${existingLink.t17Username}**. Use \`/unlink\` first if you want to change accounts.`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const playerData = await this.crcon.getPlayerByT17Username(t17Username);
            
            if (!playerData) {
                return await interaction.editReply({
                    content: `❌ T17 username "${t17Username}" not found in Hell Let Loose records.`
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
                .setColor(COLORS.SUCCESS)
                .setTitle('✅ Account Linked Successfully!')
                .addFields(
                    { name: '🎮 T17 Username', value: playerData.name, inline: true },
                    { name: '🎯 Platform', value: this.crcon.detectPlatform(playerData), inline: true },
                    { name: '📅 Linked At', value: new Date().toLocaleString(), inline: true }
                );

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            Logger.error('Error in link command:', error);
            await interaction.editReply({
                content: '❌ Failed to link account. The server might be temporarily unavailable.'
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
            .setDescription(`Your Discord account has been unlinked from T17 username **${linkedData.t17Username}**.`);

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handleVipCommand(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const linkedData = await this.database.getPlayerByDiscordId(targetUser.id);

        if (!linkedData) {
            return await interaction.reply({
                content: targetUser.id === interaction.user.id 
                    ? '❌ You haven\'t linked your Hell Let Loose account yet. Use `/link` to get started!'
                    : '❌ That user hasn\'t linked their Hell Let Loose account yet.',
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
                content: '❌ Failed to check VIP status. The server might be temporarily unavailable.'
            });
        }
    }

    async handleDebugCommand(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
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
                            { name: 'Server', value: connectionTest.serverName || 'Unknown', inline: true }
                        );
                    
                    if (!connectionTest.connected) {
                        embed.addFields({ name: 'Error', value: connectionTest.error, inline: false });
                    }
                    
                    await interaction.editReply({ embeds: [embed] });
                    break;

                case 'player':
                    const testUsername = interaction.options.getString('t17_username');
                    
                    try {
                        const playerResult = await this.crcon.getPlayerByT17Username(testUsername);
                        
                        const playerEmbed = new EmbedBuilder()
                            .setTitle(`🔍 Player Search: ${testUsername}`)
                            .setColor(COLORS.INFO)
                            .addFields(
                                { name: 'Search Result', value: playerResult ? '✅ FOUND' : '❌ NOT FOUND', inline: true }
                            );
                            
                        if (playerResult) {
                            playerEmbed.addFields(
                                { name: 'Name', value: playerResult.name || 'N/A', inline: true },
                                { name: 'Steam ID', value: playerResult.steam_id_64 || 'N/A', inline: true }
                            );
                        }
                        
                        await interaction.editReply({ embeds: [playerEmbed] });
                    } catch (error) {
                        await interaction.editReply({
                            content: `❌ Debug failed: ${error.message}`
                        });
                    }
                    break;

                default:
                    await interaction.editReply({
                        content: `❌ Unknown debug subcommand: ${subcommand}`
                    });
            }

        } catch (error) {
            Logger.error('Error in debug command:', error);
            await interaction.editReply({
                content: `❌ Debug command failed: ${error.message}`
            });
        }
    }
}

module.exports = CommandHandler;
