// Add this to your SlashCommandBuilder definitions in registerCommands():

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

// Add this complete method to your CommandHandler class:

async handleAdminLinkCommand(interaction) {
    // Check admin permissions
    if (!interaction.member.permissions.has('Administrator')) {
        return await interaction.reply({
            content: '❌ You need Administrator permissions to use this command.',
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
            .setColor(0x00FF00)
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
                .setColor(0x00FF00)
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

// Helper method to validate Steam ID format
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

// Helper method to detect platform from Steam ID
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

// Helper method to normalize platform display
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

// Helper method to find player by Steam ID in CRCON
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

        // Try player history/recent logs if available
        try {
            const recentLogs = await this.crcon.makeRequest('/api/get_recent_logs', 'GET', {
                filter_player: steamId,
                start: 0,
                end: 1,
                exact_player_match: true
            });
            
            if (recentLogs && recentLogs.logs && recentLogs.logs.length > 0) {
                const logEntry = recentLogs.logs[0];
                if (logEntry.player_name) {
                    return { name: logEntry.player_name };
                }
            }
        } catch (logError) {
            Logger.debug('Could not search logs for Steam ID:', logError.message);
        }

        return null;
    } catch (error) {
        Logger.error('Error finding player by Steam ID:', error);
        return null;
    }
}
