// Add these methods to your commandHandler.js file

// Add this to the command definitions in registerCommands():
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
    .setDefaultMemberPermissions('0'),

// Add these cases to the switch statement in handleCommand():
case 'debugvip':
    await this.handleDebugVipCommand(interaction);
    break;
case 'debugplayer':
    await this.handleDebugPlayerCommand(interaction);
    break;

// Add these handler methods:

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
