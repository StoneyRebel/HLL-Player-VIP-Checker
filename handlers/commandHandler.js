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

                // Admin Commands (no permissions for now)
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
                        option.setName('display_name')
                            .setDescription('Custom display name (use with steam_id for players not found by username)')
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
                    ),

                new SlashCommandBuilder()
                    .setName('adminunlink')
                    .setDescription('Remove a player\'s account link (Admin only)')
                    .addUserOption(option =>
                        option.setName('discord_user')
                            .setDescription('The Discord user to unlink')
                            .setRequired(true)
                    ),

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
                    ),

                new SlashCommandBuilder()
                    .setName('vippanel')
                    .setDescription('Create a VIP management panel (Admin only)'),

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
    ),