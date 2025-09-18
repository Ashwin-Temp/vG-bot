const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} = require('discord.js');

// --- 1. Shared Helper Functions ---

function checkWinner(board) {
    const winningLines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
        [0, 4, 8], [2, 4, 6]             // Diagonals
    ];
    for (const line of winningLines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return board.every(cell => cell) ? 'draw' : null;
}

function createGameRows(board, isGameOver) {
    const buttons = board.map((cell, i) =>
        new ButtonBuilder()
        .setCustomId(`cell_${i}`)
        .setLabel(cell || '‎ ') // Zero-width space for an "empty" label
        .setStyle(cell === 'X' ? ButtonStyle.Danger : cell === 'O' ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(isGameOver || cell !== null)
    );
    return [
        new ActionRowBuilder().addComponents(buttons.slice(0, 3)),
        new ActionRowBuilder().addComponents(buttons.slice(3, 6)),
        new ActionRowBuilder().addComponents(buttons.slice(6, 9)),
    ];
}

// ===================================================================================
// ✨ REVISED & SIMPLIFIED EMBED FUNCTION ✨
// ===================================================================================
function makeGameEmbed({ players, board, currentPlayerSymbol, winner, interaction, isBotGame = false }) {
    const getDisplayName = (user) => {
        const member = interaction.guild.members.cache.get(user.id);
        return member?.displayName || user.username;
    };

    const playerXName = getDisplayName(players['X']);
    const playerOName = isBotGame ? players['O'].username : getDisplayName(players['O']);

    const boardEmojis = { 'X': '❌', 'O': '⭕', null: '➖' };
    const boardRows = [];
    for (let i = 0; i < 3; i++) {
        const row = [board[i * 3], board[i * 3 + 1], board[i * 3 + 2]];
        boardRows.push(row.map(cell => boardEmojis[cell]).join(' | '));
    }
    const boardString = `\`\`\`\n${boardRows.join('\n')}\n\`\`\``;

    const embed = new EmbedBuilder().setTimestamp();
    let statusText;

    if (winner) {
        embed.setColor('#f1c40f').setFooter({ text: 'Game Over!' });
        if (winner === 'draw') {
            statusText = "🤝 It's a draw! Well played by both sides.";
            embed.setTitle('Tic-Tac-Toe: Stalemate!');
        } else if (winner === 'timeout') {
            statusText = "⌛ Game Timed Out! The board is frozen in time.";
            embed.setTitle('Tic-Tac-Toe: Out of Time!');
        } else {
            const winnerName = (isBotGame && winner === 'O') ? "vG Bot" : getDisplayName(players[winner]);
            statusText = `🏆 **${winnerName} (${winner})** has won!ㅤㅤ`;
            embed.setTitle(`Victory for ${winnerName}!`);
        }
    } else {
        if (isBotGame && currentPlayerSymbol === 'O') {
            statusText = `🤖 Bot is thinking...`;
            embed.setColor('#7f8c8d').setTitle(`Tic-Tac-Toe`).setFooter({ text: 'The machine is calculating its move.' });
        } else {
            const currentPlayerUser = players[currentPlayerSymbol];
            const currentTurnName = `**${getDisplayName(currentPlayerUser)}**`;
            statusText = `👉 It's ${currentTurnName}'s turn.`;
            embed.setColor(currentPlayerSymbol === 'X' ? '#e74c3c' : '#3498db').setTitle(`Tic-Tac-Toe | ${getDisplayName(currentPlayerUser)}'s Move`).setFooter({ text: 'A classic battle of wits.' });
        }
    }

    embed.setDescription(boardString)
         .addFields(
            { name: 'Player ❌', value: playerXName, inline: false },
            { name: 'Player ⭕', value: playerOName, inline: false },
            { name: 'Status', value: statusText, inline: false }
        );
    return embed;
}
// ===================================================================================
// END OF CHANGES
// ===================================================================================

// --- 2. The Player-vs-Player Game Function ---

async function startTicTacToe(interaction) {
    try {
        const initialChallenger = interaction.user;
        const initialOpponent = interaction.options.getUser('opponent');

        // This is a new helper function to avoid repeating code.
        // It contains the logic for running one full game.
        const runGame = async (gameInteraction, challenger, opponent) => {
            let board = Array(9).fill(null);
            // Players are now assigned based on who is challenging for the current game
            const players = { 'X': challenger, 'O': opponent };
            let currentPlayerSymbol = 'X';
            let gameOver = false;

            // When a rematch starts, we can't edit the reply of the button click.
            // We need to check if the interaction has already been replied to.
            const isRematchInteraction = gameInteraction.deferred || gameInteraction.replied;
            const gamePayload = {
                content: null,
                embeds: [makeGameEmbed({ players, board, currentPlayerSymbol, interaction: gameInteraction })],
                components: createGameRows(board, false),
                fetchReply: true
            };
            
            const gameMessage = isRematchInteraction 
                ? await gameInteraction.followUp(gamePayload) 
                : await gameInteraction.editReply(gamePayload);


            const gameCollector = gameMessage.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });

            gameCollector.on('collect', async button_i => {
                if (button_i.user.id !== players[currentPlayerSymbol].id) return button_i.reply({ content: "It's not your turn!", ephemeral: true });
                
                await button_i.deferUpdate();
                const idx = parseInt(button_i.customId.split('_')[1]);
                if (board[idx]) return;

                board[idx] = currentPlayerSymbol;
                const winner = checkWinner(board);

                if (winner) {
                    gameOver = true;
                    gameCollector.stop();
                    await button_i.editReply({ embeds: [makeGameEmbed({ players, board, winner, interaction: gameInteraction })], components: createGameRows(board, true) });

                    // --- ✨ Automated PvP Rematch Logic ✨ ---
                    if (winner === 'X' || winner === 'O') {
                        const loser = (winner === 'X') ? players['O'] : players['X'];
                        const winnerUser = (winner === 'X') ? players['X'] : players['O'];

                        const challengeBackButtons = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('challenge_back').setLabel('Challenge Back').setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId('give_up').setLabel('Give Up').setStyle(ButtonStyle.Secondary)
                        );

                        const followUpMessage = await button_i.followUp({
                            content: `Hey ${loser}, you have been defeated! Will you accept this fate or challenge **${winnerUser.username}** again?`,
                            components: [challengeBackButtons],
                            fetchReply: true,
                        });

                        const buttonCollector = followUpMessage.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

                        buttonCollector.on('collect', async btnInteraction => {
                            if (btnInteraction.user.id !== loser.id) {
                                return btnInteraction.reply({ content: "These buttons aren't for you.", ephemeral: true });
                            }
                            
                            // --- Automatic Rematch Challenge ---
                            if (btnInteraction.customId === 'challenge_back') {
                                // The loser is now the challenger
                                const newChallenger = loser;
                                const newOpponent = winnerUser;
                                
                                await btnInteraction.update({ content: `🔥 **${newChallenger.username}** has challenged **${newOpponent.username}** to a rematch!`, components: [] });

                                // Send the new challenge to the winner
                                const rematchEmbed = new EmbedBuilder().setTitle(`⚔️ A Rematch is Demanded!`).setDescription(`**${newChallenger.username}** demands a rematch! Do you accept, **${newOpponent.username}**?`).setColor('Gold');
                                const rematchButtons = new ActionRowBuilder().addComponents(
                                    new ButtonBuilder().setCustomId('accept_rematch').setLabel('Accept').setStyle(ButtonStyle.Success),
                                    new ButtonBuilder().setCustomId('decline_rematch').setLabel('Decline').setStyle(ButtonStyle.Danger)
                                );
                                
                                const rematchChallengeMsg = await btnInteraction.followUp({ content: `Hey ${newOpponent}, you have a rematch challenge!`, embeds: [rematchEmbed], components: [rematchButtons], fetchReply: true });
                                const rematchCollector = rematchChallengeMsg.createMessageComponentCollector({ componentType: ComponentType.Button, max: 1, time: 60000 });

                                rematchCollector.on('collect', async rematch_i => {
                                    if (rematch_i.user.id !== newOpponent.id) return rematch_i.reply({ content: 'This challenge is not for you.', ephemeral: true });
                                    
                                    if (rematch_i.customId === 'accept_rematch') {
                                        await rematch_i.deferUpdate();
                                        // Start a new game with the roles reversed
                                        runGame(rematch_i, newChallenger, newOpponent);
                                    } else {
                                        rematch_i.update({ content: `**${newOpponent.username}** has declined the rematch. The duel is over.`, embeds:[], components: [] });
                                    }
                                });

                                rematchCollector.on('end', (collected, reason) => {
                                    if (reason === 'time' && collected.size === 0) {
                                        rematchChallengeMsg.edit({ content: 'The rematch challenge was not answered in time.', embeds: [], components: [] }).catch(() => {});
                                    }
                                });

                            } else if (btnInteraction.customId === 'give_up') {
                                await btnInteraction.update({ content: `🏳️ **${loser.username}** has admitted defeat.`, components: [] });
                            }
                        });

                         buttonCollector.on('end', collected => {
                            if (collected.size === 0) {
                                followUpMessage.edit({ content: 'The challenge for a rematch has expired.', components: [] }).catch(() => {});
                            }
                        });
                    }
                } else {
                    currentPlayerSymbol = currentPlayerSymbol === 'X' ? 'O' : 'X';
                    await button_i.editReply({ embeds: [makeGameEmbed({ players, board, currentPlayerSymbol, interaction: gameInteraction })], components: createGameRows(board, false) });
                }
            });
            
             gameCollector.on('end', (collected, reason) => {
                if (!gameOver && reason === 'time') {
                    gameMessage.edit({ embeds: [makeGameEmbed({ players, board, winner: 'timeout', interaction: gameInteraction })], components: createGameRows(board, true) }).catch(() => {});
                }
            });
        };

        // --- Initial Challenge Logic ---
        const challengeEmbed = new EmbedBuilder().setTitle(`⚔️ A Duel is Proposed!`).setDescription(`${initialChallenger.displayName} has challenged ${initialOpponent} to a game of Tic-Tac-Toe!`).setColor('Yellow');
        const challengeButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('accept_duel').setLabel('Accept').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('decline_duel').setLabel('Decline').setStyle(ButtonStyle.Danger));

        const challengeMessage = await interaction.editReply({ content: `Hey ${initialOpponent}, you have a challenge!`, embeds: [challengeEmbed], components: [challengeButtons], fetchReply: true });
        const challengeCollector = challengeMessage.createMessageComponentCollector({ componentType: ComponentType.Button, max: 1, time: 60000 });

        challengeCollector.on('collect', async i => {
            if (i.user.id !== initialOpponent.id) return i.reply({ content: 'This challenge is not for you.', ephemeral: true });
            if (i.customId === 'decline_duel') return i.update({ content: `${i.member.displayName} has declined the duel.`, embeds: [], components: [] });

            await i.deferUpdate();
            // Start the first game
            runGame(i, initialChallenger, initialOpponent);
        });

        challengeCollector.on('end', (collected, reason) => {
            if (collected.size === 0 && reason === 'time') {
                interaction.editReply({ content: 'The challenge was not answered in time.', embeds: [], components: [] }).catch(() => {});
            }
        });

    } catch (error) {
        console.error("Error in PvP Tic-Tac-Toe:", error);
    }
}


// --- 3. The Player-vs-Bot Game Function ---

async function startTicTacToeWithBot(interaction, isRematch = false) {
    try {
        if (!isRematch && !interaction.deferred && !interaction.replied) await interaction.deferReply();
        
        let board = Array(9).fill(null);
        const playerUser = interaction.user;
        const players = { 'X': playerUser, 'O': interaction.client.user };
        let gameOver = false;
        let currentPlayerSymbol;

        const findBestMove = (b) => {
            let bestScore = -Infinity; let move; for (let i = 0; i < 9; i++) { if (b[i] === null) { b[i] = 'O'; let score = minimax(b, 0, false); b[i] = null; if (score > bestScore) { bestScore = score; move = i; } } } return move; };
        const scores = { 'O': 10, 'X': -10, 'draw': 0 };
        const minimax = (b, d, isMax) => { const winner = checkWinner(b); if (winner !== null) return scores[winner]; if (isMax) { let bestScore = -Infinity; for (let i = 0; i < 9; i++) { if (b[i] === null) { b[i] = 'O'; bestScore = Math.max(bestScore, minimax(b, d + 1, false)); b[i] = null; } } return bestScore; } else { let bestScore = Infinity; for (let i = 0; i < 9; i++) { if (b[i] === null) { b[i] = 'X'; bestScore = Math.min(bestScore, minimax(b, d + 1, true)); b[i] = null; } } return bestScore; } };

        if (isRematch) {
            interaction.channel.send(`${playerUser}, you accepted the rematch. vG Bot activated GOD mode..`);
        }

        const startsFirst = Math.random() < 0.5 ? 'X' : 'O';
        currentPlayerSymbol = startsFirst;

        if (startsFirst === 'O') {
            let firstMove;
            if (isRematch) {
                const corners = [0, 2, 6, 8];
                firstMove = corners[Math.floor(Math.random() * corners.length)];
            } else {
                firstMove = Math.floor(Math.random() * 9);
            }
            board[firstMove] = 'O';
            currentPlayerSymbol = 'X';
        }

        const gamePayload = { content: null, embeds: [makeGameEmbed({ players, board, currentPlayerSymbol, interaction, isBotGame: true })], components: createGameRows(board, false), fetchReply: true };
        const gameMessage = isRematch ? await interaction.channel.send(gamePayload) : await interaction.editReply(gamePayload);
        const gameCollector = gameMessage.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });

        const handleGameOver = async (finalWinner, finalInteraction) => {
            if (finalWinner === 'O') { // Bot wins
                if (isRematch) {
                    await finalInteraction.followUp({ content: "See? I told you that you wouldn't win." });
                } else {
                    const challengeBackButtons = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('challenge_bot_again').setLabel('Challenge').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('give_up_bot').setLabel('Give Up').setStyle(ButtonStyle.Secondary)
                    );
                    const challengeMessage = await finalInteraction.followUp({
                        content: "Imagine losing to a bot 💀.\n Do you want me to challenge you back?",
                        components: [challengeBackButtons],
                        fetchReply: true
                    });

                    const challengeCollector = challengeMessage.createMessageComponentCollector({ componentType: ComponentType.Button, max: 1, time: 60000 });
                    
                    challengeCollector.on('collect', async rem_i => {
                        if (rem_i.customId === 'challenge_bot_again') {
                            await rem_i.update({ content: 'So you have chosen death... A new battle begins!', components: [] });
                            startTicTacToeWithBot(interaction, true); // Start a rematch
                        } else {
                            await rem_i.update({ content: 'Better luck next time!', components: [] });
                        }
                    });

                    challengeCollector.on('end', collected => {
                        if (collected.size === 0) {
                            challengeMessage.edit({ content: 'The challenge has expired.', components: [] }).catch(() => {});
                        }
                    });
                }
            } else if (finalWinner === 'X' || finalWinner === 'draw') { // Player wins or draws
                const rematchMessageText = finalWinner === 'draw' ? "A draw? The bot knows it can win. It challenges you again!" : "You got lucky... The bot demands a rematch!";
                const rematchButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('accept_rematch_bot').setLabel('Accept Rematch!').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('decline_rematch_bot').setLabel('Decline').setStyle(ButtonStyle.Danger));
                const rematchMessage = await finalInteraction.followUp({ content: rematchMessageText, components: [rematchButtons], fetchReply: true });
                const rematchCollector = rematchMessage.createMessageComponentCollector({ componentType: ComponentType.Button, max: 1, time: 60000 });
                
                rematchCollector.on('collect', async rem_i => {
                    if (rem_i.customId === 'accept_rematch_bot') {
                        await rem_i.update({ content: 'A new battle begins!', components: [] });
                        startTicTacToeWithBot(interaction, true);
                    } else {
                        await rem_i.update({ content: 'Bro is scared already 💀', components: [] });
                    }
                });
            }
        };

        gameCollector.on('collect', async i => {
            if (i.user.id !== playerUser.id) return i.reply({ content: "This is not your game!", ephemeral: true });
            
            await i.deferUpdate();
            const humanMove = parseInt(i.customId.split('_')[1]);
            if (board[humanMove]) return;

            board[humanMove] = 'X';
            let winner = checkWinner(board);

            if (winner) {
                gameOver = true;
                gameCollector.stop();
                await i.editReply({ embeds: [makeGameEmbed({ players, board, winner, interaction, isBotGame: true })], components: createGameRows(board, true) });
                await handleGameOver(winner, i);
                return;
            }

            currentPlayerSymbol = 'O';
            await i.editReply({ embeds: [makeGameEmbed({ players, board, currentPlayerSymbol, interaction, isBotGame: true })], components: createGameRows(board, true) }); 
            await new Promise(resolve => setTimeout(resolve, 1000));

            const botMove = findBestMove(board);
            board[botMove] = 'O';
            winner = checkWinner(board);
            currentPlayerSymbol = 'X';

            if (winner) {
                gameOver = true;
                gameCollector.stop();
            }
            
            await i.editReply({ embeds: [makeGameEmbed({ players, board, currentPlayerSymbol, winner, interaction, isBotGame: true })], components: createGameRows(board, gameOver) });

            if (winner) {
                await handleGameOver(winner, i);
            }
        });

        gameCollector.on('end', async (collected, reason) => {
            if (reason === 'time' && !gameOver) {
                await gameMessage.edit({ embeds: [makeGameEmbed({ players, board, winner: 'timeout', interaction, isBotGame: true })], components: createGameRows(board, true) }).catch(() => {});
            }
        });
    } catch (error) {
        console.error("Error in PvE Tic-Tac-Toe:", error);
    }
}
// --- 4. The Command Export ---
module.exports = {
    startTicTacToe,
    startTicTacToeWithBot
};