const { EmbedBuilder } = require('discord.js');
const Logger = require('../utils/logger');
const { Validators, ValidationError } = require('../utils/validators');
const { COLORS, EMOJIS, MESSAGES } = require('../config/constants');

class ContestService {
    constructor(database, crcon) {
        this.database = database;
        this.crcon = crcon;
        this.currentContest = null;
        this.submissions = new Map();
    }

    async getCurrentContest() {
        return this.currentContest;
    }

    async handleCreate(interaction) {
        if (this.currentContest && this.currentContest.active) {
            return await interaction.reply({
                content: '❌ There is already an active contest. End it first with `/contest end`.',
                ephemeral: true
            });
        }

        try {
            const title = interaction.options.getString('title').trim();
            const description = interaction.options.getString('description').trim();
            const durationHours = interaction.options.getInteger('duration_hours');
            const prize = interaction.options.getString('prize').trim();
            const maxWinners = interaction.options.getInteger('max_winners') || 1;

            await interaction.deferReply({ ephemeral: true });

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

            this.submissions.clear();

            const inGameMessage = `🏆 NEW VIP CONTEST: ${title} | Prize: ${prize} | Duration: ${durationHours}h | Join our Discord to participate!`;
            
            let messagingResult = { success: false, error: 'Not attempted' };
            
            try {
                await this.crcon.sendMessageToAllPlayers(inGameMessage);
                messagingResult = { success: true };
            } catch (error) {
                Logger.error('Failed to send in-game contest announcement:', error);
                messagingResult = { success: false, error: error.message };
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
                    { name: '🏁 Ends At', value: endTime.toLocaleString(), inline: true },
                    { 
                        name: '📢 In-Game Announcement', 
                        value: messagingResult.success ? '✅ Sent successfully' : `❌ Failed: ${messagingResult.error}`, 
                        inline: false 
                    }
                );

            if (messagingResult.success) {
                embed.setFooter({ text: 'Contest announcement sent to all players in-game!' });
            } else {
                embed.setFooter({ text: 'Contest created, but in-game announcement failed. Check CRCON connection.' });
            }

            await interaction.editReply({ embeds: [embed] });
            Logger.info(`Contest created: ${title} by ${interaction.user.tag}`);

        } catch (error) {
            Logger.error('Error creating contest:', error);
            await interaction.editReply({
                content: '❌ Failed to create contest. Please try again later.'
            });
        }
    }

    async handleEnd(interaction) {
        if (!this.currentContest) {
            return await interaction.reply({
                content: '❌ No active contest to end.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const submissionCount = this.submissions.size;
            
            this.currentContest.active = false;
            this.currentContest.endedAt = new Date().toISOString();
            this.currentContest.endedBy = interaction.user.id;

            try {
                await this.crcon.sendMessageToAllPlayers(`🏆 Contest "${this.currentContest.title}" has ended! Check Discord for results.`);
            } catch (error) {
                Logger.error('Failed to send contest end announcement:', error);
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
            Logger.info(`Contest ended: ${this.currentContest.title} by ${interaction.user.tag}`);

        } catch (error) {
            Logger.error('Error ending contest:', error);
            await interaction.editReply({
                content: '❌ Failed to end contest. Please try again later.'
            });
        }
    }

    async handleWinners(interaction) {
        if (!this.currentContest) {
            return await interaction.reply({
                content: '❌ No contest available for winner selection.',
                ephemeral: true
            });
        }

        const winnerIdsString = interaction.options.getString('winner_ids');
        const winnerIds = winnerIdsString.split(',').map(id => id.trim()).filter(id => id.length > 0);

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
                    const user = await interaction.client.users.fetch(winnerId);
                    winners.push({
                        id: winnerId,
                        tag: user.tag,
                        username: user.username
                    });

                    const dmEmbed = new EmbedBuilder()
                        .setColor(0xFFD700)
                        .setTitle('🎉 Congratulations! You Won!')
                        .addFields(
                            { name: '🏆 Contest', value: this.currentContest.title, inline: false },
                            { name: '🎁 Prize', value: this.currentContest.prize, inline: true }
                        )
                        .setFooter({ text: 'Contact a server administrator to claim your prize!' });

                    try {
                        await user.send({ embeds: [dmEmbed] });
                    } catch (dmError) {
                        Logger.warn(`Failed to send DM to winner ${user.tag}:`, dmError.message);
                    }

                } catch (error) {
                    Logger.error(`Failed to process winner ${winnerId}:`, error);
                }
            }

            if (winners.length === 0) {
                return await interaction.editReply({
                    content: '❌ No valid winners found. Please check the user IDs and try again.'
                });
            }

            this.currentContest.winners = winners;
            this.currentContest.winnersSelectedAt = new Date().toISOString();
            this.currentContest.winnersSelectedBy = interaction.user.id;

            const winnerTags = winners.map(w => w.tag).join(', ');
            try {
                await this.crcon.sendMessageToAllPlayers(`🎉 Contest winners: ${winnerTags}! Congratulations!`);
            } catch (error) {
                Logger.error('Failed to send winner announcement:', error);
            }

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🎉 Contest Winners Selected!')
                .addFields(
                    { name: '🏆 Contest', value: this.currentContest.title, inline: false },
                    { name: '👑 Winners', value: winnerTags, inline: false },
                    { name: '🎁 Prize', value: this.currentContest.prize, inline: true }
                )
                .setFooter({ text: 'Winners have been selected and notified!' });

            await interaction.editReply({ embeds: [embed] });
            Logger.info(`Contest winners selected for: ${this.currentContest.title} - Winners: ${winnerTags}`);

        } catch (error) {
            Logger.error('Error selecting winners:', error);
            await interaction.editReply({
                content: '❌ Failed to select winners. Please try again later.'
            });
        }
    }

    async handleStatus(interaction) {
        if (!this.currentContest) {
            return await interaction.reply({
                content: '❌ No contest data available.',
                ephemeral: true
            });
        }

        try {
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
                    { name: '📝 Submissions', value: this.submissions.size.toString(), inline: true }
                );

            if (this.currentContest.active && timeLeft > 0) {
                embed.addFields({ name: '⏰ Time Remaining', value: `${timeLeft} hours`, inline: true });
            }

            if (this.currentContest.winners && this.currentContest.winners.length > 0) {
                const winnerList = this.currentContest.winners.map(w => `• ${w.tag}`).join('\n');
                embed.addFields({ name: '👑 Winners', value: winnerList, inline: false });
            }

            embed.setFooter({ 
                text: `Created: ${new Date(this.currentContest.startTime).toLocaleString()}`
            });

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            Logger.error('Error getting contest status:', error);
            await interaction.reply({
                content: '❌ Failed to get contest status. Please try again later.',
                ephemeral: true
            });
        }
    }

    async save() {
        return true;
    }
}

module.exports = ContestService;
