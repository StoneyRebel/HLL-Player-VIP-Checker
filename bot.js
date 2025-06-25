// HLL Player VIP Checker - Refactored and Improved
// Created by StoneyRebel

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

// Import our modular services
const DatabaseService = require('./services/database');
const CRCONService = require('./services/crcon');
const ContestService = require('./services/contest');
const VIPNotificationService = require('./services/vipNotifications');
const LeaderboardService = require('./services/leaderboard');
const CommandHandler = require('./handlers/commandHandler');
const InteractionHandler = require('./handlers/interactionHandler');

// Import utilities
const Logger = require('./utils/logger');
const RateLimiter = require('./utils/rateLimiter');
const config = require('./config/environment');
const { COLORS, EMOJIS, MESSAGES } = require('./config/constants');

class HLLPlayerVIPChecker {
    constructor() {
        // Initialize Discord client
        this.client = new Client({ 
            intents: [
                GatewayIntentBits.Guilds, 
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.DirectMessages
            ] 
        });

        // Initialize services
        this.database = null;
        this.crcon = null;
        this.contest = null;
        this.vipNotifications = null;
        this.leaderboard = null;
        this.rateLimiter = new RateLimiter();

        // Initialize handlers
        this.commandHandler = null;
        this.interactionHandler = null;

        // Cleanup tracking
        this.intervals = [];
        this.timeouts = [];
    }

    async initialize() {
        try {
            Logger.info('🚀 Starting HLL Player VIP Checker...');
            
            // Initialize services in correct order
            await this.initializeServices();
            await this.initializeHandlers();
            await this.setupEventListeners();
            
            Logger.info('✅ Bot initialization complete');
            
        } catch (error) {
            Logger.error('❌ Failed to initialize bot:', error);
            throw error;
        }
    }

    async initializeServices() {
        Logger.info('🔧 Initializing services...');
        
        // Initialize database
        this.database = new DatabaseService(config.database);
        await this.database.initialize();
        
        // Initialize CRCON service
        this.crcon = new CRCONService(config.crcon);
        
        // Initialize contest service
        this.contest = new ContestService(this.database, this.crcon);
        
        // Initialize VIP notifications
        this.vipNotifications = new VIPNotificationService(
            this.database, 
            this.crcon, 
            this.client
        );
        
        // Initialize leaderboard service
        this.leaderboard = new LeaderboardService(
            this.database, 
            this.crcon, 
            this.client
        );
        
        Logger.info('✅ All services initialized');
    }

    async initializeHandlers() {
        Logger.info('🎮 Initializing command handlers...');
        
        // Initialize command handler with all services
        this.commandHandler = new CommandHandler({
            database: this.database,
            crcon: this.crcon,
            contest: this.contest,
            vipNotifications: this.vipNotifications,
            leaderboard: this.leaderboard,
            rateLimiter: this.rateLimiter,
            client: this.client
        });
        
        // Initialize interaction handler
        this.interactionHandler = new InteractionHandler({
            database: this.database,
            crcon: this.crcon,
            contest: this.contest,
            vipNotifications: this.vipNotifications,
            leaderboard: this.leaderboard,
            rateLimiter: this.rateLimiter,
            client: this.client
        });
        
        await this.commandHandler.registerCommands();
        
        Logger.info('✅ Handlers initialized');
    }

    setupEventListeners() {
        Logger.info('📡 Setting up event listeners...');
        
        // Bot ready event
        this.client.once('ready', async () => {
            Logger.info(`✅ Bot logged in as ${this.client.user.tag}!`);
            Logger.info(`🔗 Connected to ${this.client.guilds.cache.size} server(s)`);
            Logger.info(`🌐 CRCON URL: ${config.crcon.baseUrl}`);
            
            // Start background services
            await this.startBackgroundServices();
        });

        // Interaction handling
        this.client.on('interactionCreate', async (interaction) => {
            try {
                // Rate limiting check
                if (!this.rateLimiter.checkUserLimit(interaction.user.id)) {
                    return await interaction.reply({
                        content: MESSAGES.ERRORS.RATE_LIMITED,
                        ephemeral: true
                    });
                }

                await this.interactionHandler.handle(interaction);
                
            } catch (error) {
                Logger.error('Error handling interaction:', error);
                await this.handleInteractionError(interaction, error);
            }
        });

        // Error handling
        this.client.on('error', (error) => {
            Logger.error('Discord client error:', error);
        });

        this.client.on('warn', (warning) => {
            Logger.warn('Discord client warning:', warning);
        });

        // Graceful shutdown
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        
        Logger.info('✅ Event listeners configured');
    }

    async startBackgroundServices() {
        Logger.info('🔄 Starting background services...');
        
        try {
            // Start VIP notifications (every hour)
            const vipInterval = setInterval(async () => {
                try {
                    await this.vipNotifications.checkExpirations();
                } catch (error) {
                    Logger.error('VIP notification check failed:', error);
                }
            }, 60 * 60 * 1000);
            this.intervals.push(vipInterval);

            // Start leaderboard updates (every hour)
            const leaderboardInterval = setInterval(async () => {
                try {
                    await this.leaderboard.updateAll();
                } catch (error) {
                    Logger.error('Leaderboard update failed:', error);
                }
            }, 60 * 60 * 1000);
            this.intervals.push(leaderboardInterval);

            // Initial runs after 30 seconds
            const initialTimeout = setTimeout(async () => {
                try {
                    await Promise.allSettled([
                        this.vipNotifications.checkExpirations(),
                        this.leaderboard.updateAll()
                    ]);
                } catch (error) {
                    Logger.error('Initial background service run failed:', error);
                }
            }, 30000);
            this.timeouts.push(initialTimeout);

            Logger.info('✅ Background services started');
            
        } catch (error) {
            Logger.error('Failed to start background services:', error);
        }
    }

    async handleInteractionError(interaction, error) {
        const errorMessage = error.message.includes('CRCON') 
            ? MESSAGES.ERRORS.SERVER_UNAVAILABLE
            : '❌ An error occurred while processing your command.';
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ 
                    content: errorMessage, 
                    ephemeral: true 
                });
            } else {
                await interaction.reply({ 
                    content: errorMessage, 
                    ephemeral: true 
                });
            }
        } catch (followUpError) {
            Logger.error('Failed to send error message:', followUpError);
        }
    }

    async start() {
        try {
            await this.initialize();
            await this.client.login(config.discord.token);
        } catch (error) {
            Logger.error('❌ Failed to start bot:', error);
            process.exit(1);
        }
    }

    async shutdown() {
        Logger.info('\n🛑 Shutting down gracefully...');
        
        try {
            // Clear all intervals and timeouts
            this.intervals.forEach(interval => clearInterval(interval));
            this.timeouts.forEach(timeout => clearTimeout(timeout));
            
            // Save all data
            await Promise.allSettled([
                this.database?.close(),
                this.contest?.save(),
                this.vipNotifications?.save(),
                this.leaderboard?.save()
            ]);
            
            // Destroy Discord client
            this.client?.destroy();
            
            Logger.info('✅ Graceful shutdown complete');
            process.exit(0);
            
        } catch (error) {
            Logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    }
}

// Create and start the bot
const bot = new HLLPlayerVIPChecker();
bot.start().catch(error => {
    Logger.error('Fatal error starting bot:', error);
    process.exit(1);
});
