// Replace the adminlink command definition in registerCommands() with this:

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
            .setDescription('The player\'s Steam ID (alternative to username)')
            .setRequired(false)
    )
    .setDefaultMemberPermissions('0'),

// Replace the handleAdminLinkCommand method with this:

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

    // Validate input
    if (!t17Username && !steamId) {
        return await interaction.reply({
            content: '❌ You must provide either a T17 username or Steam ID.',
            ephemeral: true
        });
    }

    if (t17Username && steamId) {
        return await interaction.reply({
            content: '❌ Please provide either a T17 username OR Steam ID, not both.',
            ephemeral: true
        });
    }

    // Check if user is already linked
    const existingLink = await this.database.getPlayerByDiscordId(targetUser.id);
    if (existingLink) {
        return await interaction.reply({
            content: `❌ ${targetUser.tag} is already linked to **${existingLink.t17Username}**. Use \`/unlink\` on them first.`,
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        let playerData = null;

        if (steamId) {
            // Admin provided Steam ID - try to get player info
            try {
                // First try to find the player in VIP list (most reliable)
                const vipData = await this.crcon.makeRequest('/api/get_vip_ids');
                if (vipData && Array.isArray(vipData)) {
                    const vipPlayer = vipData.find(vip => 
                        vip && (vip.player_id === steamId || vip.steam_id_64 === steamId)
                    );
                    
                    if (vipPlayer) {
                        playerData = {
                            name: vipPlayer.name || `Player_${steamId.slice(-4)}`,
                            steam_id_64: steamId,
                            display_name: vipPlayer.name || `Player_${steamId.slice(-4)}`
                        };
                    }
                }

                // If not found in VIP list, try current players
                if (!playerData) {
                    const currentPlayers = await this.crcon.makeRequest('/api/get_players');
                    if (currentPlayers && Array.isArray(currentPlayers)) {
                        const onlinePlayer = currentPlayers.find(player => 
                            player && (player.player_id === steamId || player.steam_id_64 === steamId)
                        );
                        
                        if (onlinePlayer) {
                            playerData = {
                                name: onlinePlayer.name,
                                steam_id_64: steamId,
                                display_name: onlinePlayer.name
                            };
                        }
                    }
                }

                // If still not found, create basic entry
                if (!playerData) {
                    playerData = {
                        name: `Player_${steamId.slice(-6)}`,
                        steam_id_64: steamId,
                        display_name: `Player_${steamId.slice(-6)}`
                    };
                }

            } catch (error) {
                Logger.error('Error looking up Steam ID:', error);
                return await interaction.editReply({
                    content: `❌ Failed to lookup Steam ID "${steamId}". Make sure it's valid.`
                });
            }

        } else {
            // Admin provided T17 username - use existing lookup
            playerData = await this.crcon.getPlayerByT17Username(t17Username);
            
            if (!playerData) {
                return await interaction.editReply({
                    content: `❌ T17 username "${t17Username}" not found in Hell Let Loose records.\n\n**Make sure:**\n• The player has played on this server\n• The T17 username is spelled exactly correct\n• The player is not banned from the server`
                });
            }
        }

        // Check if Steam ID is already linked to another Discord user
        const existingPlayer = await this.database.getPlayerBySteamId(playerData.steam_id_64);
        if (existingPlayer) {
            return await interaction.editReply({
                content: `❌ The Steam ID "${playerData.steam_id_64}" is already linked to another Discord user.`
            });
        }

        // Create the link
        await this.database.createPlayerLink({
            discordId: targetUser.id,
            t17Username: playerData.name,
            displayName: playerData.display_name || playerData.name,
            steamId: playerData.steam_id_64,
            platform: this.crcon.detectPlatform(playerData),
            lastSeen: playerData.last_seen || new Date().toISOString()
        });

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Admin Link Successful!')
            .addFields(
                { name: '👤 Discord User', value: targetUser.tag, inline: true },
                { name: '🎮 T17 Username', value: playerData.name, inline: true },
                { name: '🆔 Steam ID', value: playerData.steam_id_64, inline: true },
                { name: '🎯 Platform', value: this.crcon.detectPlatform(playerData), inline: true },
                { name: '👮 Linked By', value: interaction.user.tag, inline: true },
                { name: '📅 Linked At', value: new Date().toLocaleString(), inline: true }
            )
            .setFooter({ text: 'Player can now use /vip to check their status!' });

        await interaction.editReply({ embeds: [embed] });

        Logger.info(`Admin link: ${interaction.user.tag} linked ${targetUser.tag} to ${playerData.name} (${playerData.steam_id_64})`);

    } catch (error) {
        Logger.error('Error in admin link command:', error);
        await interaction.editReply({
            content: '❌ Failed to link account. The server might be temporarily unavailable.'
        });
    }
}
