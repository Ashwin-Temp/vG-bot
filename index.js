const { createCanvas } = require('canvas');
const { Client, IntentsBitField, EmbedBuilder,ActionRowBuilder,ButtonBuilder, ButtonStyle,AttachmentBuilder  } = require('discord.js');
require('dotenv').config();
const samp = require('samp-query');
const { generateTrendTodayGraph } = require('./generateTrendGraph');
const { MongoClient } = require('mongodb');  // MongoDB integration
const axios = require('axios');
const fetch = require('node-fetch');

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent
    ]
});

// Configuration
const config = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    SAMP_SERVER_IP: '163.172.105.21',
    SAMP_SERVER_PORT: 7777,
    SERVER_NAME: 'Valiant Roleplay/Freeroam',
    HEX_COLOR: '#0099ff',
    OFFLINE_COLOR: '#ff0000',
    ICON_URL: 'https://i.postimg.cc/zBrffQy6/vg.png',
    MAX_PLAYERS_PER_PAGE: 15,
    MONGODB_URI: process.env.MONGODB_URI,
    DB_NAME: 'valiant',
    COLLECTION_NAME: 'players',
    MC_SERVER_NAME: 'Minecraft Server', // Minecraft server name
    MC_HEX_COLOR: '#FF5733', // Embed color for Minecraft
    MC_ICON_URL: 'https://example.com/mc-icon.png', // Icon for Minecraft server embed
    MC_MAX_PLAYERS_PER_PAGE: 10, 
};

// MongoDB Client Setup
const clientMongo = new MongoClient(config.MONGODB_URI);
let db = null;

// Ready event when the bot logs in
client.on('ready', async () => {
    console.log(`✅ ${client.user.tag} is ready!`);
    client.user.setActivity(`${config.SERVER_NAME}`, { type: 'WATCHING' });

    try {
        await clientMongo.connect();
        db = clientMongo.db(config.DB_NAME);
        console.log('✅ MongoDB connected');
    } catch (err) {
        console.error('❌ MongoDB connection failed:', err);
    }
});

// Escape regex to prevent issues with special characters
function escapeRegex(string) {
    return string.replace(/[.*+?^=!:${}()|\[\]\/\\]/g, '\\$&');
}

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    // 🔹 Autocomplete handler
    if (interaction.isAutocomplete()) {
        const focused = interaction.options.getFocused();
        const escaped = escapeRegex(focused);  // Escape user input for regex
        const regex = new RegExp(escaped, 'i'); // Case-insensitive search anywhere in the name

        try {
            // Query using the `nameLower` field for case-insensitive search
            const suggestions = await db.collection('topactivity')
                .find({ nameLower: { $regex: regex } })
                .limit(20)  // Limit to 20 results for faster response
                .project({ name: 1 })  // Only return the 'name' field
                .toArray();

            const choices = suggestions.map(player => ({
                name: player.name,
                value: player.name
            }));

            return interaction.respond(choices);
        } catch (err) {
            console.error('❌ Autocomplete error:', err);
            return interaction.respond([]);
        }
    }

    // 🔹 Slash command handler
    if (!interaction.isCommand()) return;

    try {
        switch (interaction.commandName) {
            case 'players':
                await getPlayers(interaction);
                break;
            case 'ip':
                await getServerIP(interaction);
                break;
            case 'status':
                await getServerStatus(interaction);
                break;
            case 'help':
                await sendHelpEmbed(interaction);
                break;
            case 'top':
                await getTop(interaction);
                break;
            case 'spark':
                await sparkCommand(interaction);
                break;
            case 'cri':
                await handleCriCommand(interaction);
                break;
            case 'playtime':
                await getPlaytime(interaction);
                break;
            case 'highscore':
                await getTopActivityPlayers(interaction);
                break;
            case 'set':
                await setNameAndMergePlaytime(interaction);
                break;
            case 'vmc':
                await getMinecraftPlayers(interaction);
                break;
            case 'trend':
                await trendCommand(interaction); // New handler for the trend command
                break;
            case 'chat':
                await chatCommand(interaction); // New handler for the trend command
                break;
            case 'mcstats':
                await getMcstats(interaction);
                break;
            case 'vmcname':
                await setMcname(interaction);
                break;
            case 'mctop':
                await handleMcTop(interaction);
                break;
            case 'vgen':
                await vgenCommand(interaction);
                break;
            default:
                await interaction.reply('❓ Unknown command! Type `/help` for a list of available commands.');
        }
    } catch (err) {
        console.error('❌ Error handling interaction:', err);
        await interaction.reply('⚠️ An error occurred while processing your request. Please try again later.');
    }
});


// Command functions

// Command functions

const dailyVgenUsage = new Map(); // userId => { count, date }

function getTodayDateString() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

async function vgenCommand(interaction) {
  const prompt = interaction.options.getString('prompt');
  const userId = interaction.user.id;
  const today = getTodayDateString();

  // Skip limit for owner
  if (userId !== '785077198338916412') {
    const usage = dailyVgenUsage.get(userId);

    if (!usage || usage.date !== today) {
      dailyVgenUsage.set(userId, { count: 1, date: today });
    } else if (usage.count >= 3) {
      return await interaction.reply('⚠️ Enough for you today! You reached 3 vgen limit!');
    } else {
      usage.count += 1;
      dailyVgenUsage.set(userId, usage);
    }
  }

  const usage = dailyVgenUsage.get(userId);
  const progress = userId === '785077198338916412' ? '' : `Progress: ${usage.count}/3`;
  await interaction.deferReply({ content: `🧠 vG bot is generating your image...\n${progress}` });

  const success = await generateImage(prompt, interaction);
  if (!success) {
    await interaction.editReply('❌ Could not generate image. Try again later or with a different prompt.');
  }
}

async function generateImage(prompt, interaction) {
  // Try Hugging Face first
  try {
    const hfResponse = await fetch('https://router.huggingface.co/nebius/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux-dev',
        prompt,
        response_format: 'b64_json',
      }),
    });

    const hfJson = await hfResponse.json();
    const b64 = hfJson?.data?.[0]?.b64_json;

    if (b64) {
      const buffer = Buffer.from(b64, 'base64');
      const attachment = new AttachmentBuilder(buffer, { name: 'hf_image.png' });

      const embed = new EmbedBuilder()
        .setTitle('✨ vG Gens')
        .setDescription(`**Prompt:** ${prompt}`)
        .setImage('attachment://hf_image.png')
        .setColor(0x8e44ad)
        .setFooter({
          text: `Generated for ${interaction.member?.displayName || interaction.user.username}\nMade with ✨`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], files: [attachment] });
      return true;
    }

    throw new Error('No image returned from HF');
  } catch (err) {
    console.warn('⚠️ Hugging Face failed:', err.message || err);
  }

  // Fallback to Together.ai
  try {
    const tgResponse = await axios.post(
      'https://api.together.xyz/v1/images/generations',
      {
        model: 'black-forest-labs/FLUX.1-schnell-Free',
        prompt,
        response_format: 'b64_json',
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const b64 = tgResponse.data?.data?.[0]?.b64_json;
    if (!b64) throw new Error('No image from Together.ai');

    const buffer = Buffer.from(b64, 'base64');
    const attachment = new AttachmentBuilder(buffer, { name: 'tg_image.png' });

    const embed = new EmbedBuilder()
      .setTitle('✨ vG Gens')
      .setDescription(`**Prompt:** ${prompt}`)
      .setImage('attachment://tg_image.png')
      .setColor(0xffd700)
      .setFooter({
        text: `Generated for ${interaction.member?.displayName || interaction.user.username}\nMade with ✨`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], files: [attachment] });
    return true;
  } catch (err) {
    console.error('❌ Together.ai failed:', err.response?.data || err.message);
    return false;
  }
}


async function handleMcTop(interaction) {
  const category = interaction.options.getString('category');

  const titleMap = {
    playtime: 'ㅤㅤㅤㅤ🕒 Top AFK Warriors 🕒',
    rich: 'ㅤㅤㅤㅤ💰 Top Players to Donate 💰',
    death: 'ㅤㅤㅤㅤ☠️ Most Visits to God ☠️',
    today: '🏆 Top vMC Players Today'
  };

  try {
    await interaction.deferReply();

    if (category === 'today') {
  let response;
  try {
    response = await axios.get("https://my-worker.valiantgaming.workers.dev/get");
  } catch (apiErr) {
    console.error("Error fetching from /get:", apiErr);
    return interaction.followUp("⚠️ Failed to fetch playtime data.");
  }

  const data = response.data;
  if (!data || Object.keys(data).length === 0) {
    return interaction.followUp('❌ No playtime recorded for today.');
  }

  // Convert to array and sort by time (in minutes)
  const playersArray = Object.entries(data).map(([username, stats]) => {
    const match = stats.playtime.match(/(\d+)h (\d+)m/);
    const mins = match ? parseInt(match[1]) * 60 + parseInt(match[2]) : 0;
    return { username, ...stats, totalMinutes: mins };
  });

  const sorted = playersArray.sort((a, b) => b.totalMinutes - a.totalMinutes).slice(0, 10);

  let leaderboard = '```md\n';
  sorted.forEach((player, index) => {
    
    leaderboard += `#${String(index + 1).padEnd(2)} ${player.username.padEnd(16)} : ${player.playtime}${player.isOnline ? ' 🟡' : ''}\n`;

  });
  leaderboard += '```';

  const showDotNote = sorted.some(p => p.isOnline);

  const embed = new EmbedBuilder()
    .setTitle('ㅤㅤ✦✦ ValiantMC [1.21+] ✦✦')
    .setColor('#39FF14')
    .setDescription([
      '**🏆 Top vMC Playtime Today**',
      leaderboard,
      ...(showDotNote ? ['ㅤ🟡 Playtime updates after logout.'] : [])
    ].join('\n'))
    .setFooter({
      text: `Requested by ${interaction.member?.displayName || interaction.user.username}\nMade with ✨`,
      iconURL: interaction.user.displayAvatarURL()
    })
    .setTimestamp();

  return interaction.followUp({ embeds: [embed] });
}


    // 🟧 Handle other leaderboard categories
    let apiRes;
    try {
      apiRes = await axios.get('https://www.jinxko.com/api?endpoint=public/playerRoster');
    } catch (err) {
      console.error("Error fetching player roster:", err);
      return interaction.followUp("⚠️ Failed to fetch player data.");
    }

    const roster = apiRes.data.roster;
    if (!roster || roster.length === 0) {
      return interaction.followUp('❌ No player data found.');
    }

    let sorted = [];
    if (category === 'death') {
      sorted = roster.sort((a, b) => b.deaths - a.deaths);
    } else if (category === 'rich') {
      sorted = roster.sort((a, b) => b.balance - a.balance);
    } else if (category === 'playtime') {
      sorted = roster.sort((a, b) => parseTime(b.timePlayed) - parseTime(a.timePlayed));
    } else {
      return interaction.followUp('❌ Invalid category.');
    }

    const top10 = sorted.slice(0, 10);
    const medals = ['🥇', '🥈', '🥉', '🏅', '🏅', '🏅', '🏅', '🏅', '🏅', '🏅'];

    const lines = top10.map((p, i) => {
      const name = p.username.length > 15 ? p.username.slice(0, 14) + '…' : p.username.padEnd(15);
      let value = '';
      if (category === 'death') value = `${p.deaths}`;
      if (category === 'rich') value = `$ ${Math.floor(p.balance).toLocaleString()}`;
      if (category === 'playtime') value = formatPlaytime(p.timePlayed);
      return `${medals[i] || '➖'} ${name} : ${value}`;
    });

    const leaderboard = ['```', ...lines, '```'].join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`ㅤㅤㅤ✦✦ ValiantMC [1.21+] ✦✦`)
      .setColor('#39FF14')
      .setDescription([
        `**${titleMap[category]}**`,
        leaderboard,
        `_Updated: ${new Date().toLocaleDateString('en-GB')}_`
      ].join('\n'))
      .setFooter({
        text: `Requested by ${interaction.member?.displayName || interaction.user.username}\n• Made with ✨`,
        iconURL: interaction.user.displayAvatarURL()
      })
      .setTimestamp();

    return interaction.followUp({ embeds: [embed] });

  } catch (err) {
    console.error('Fatal error in /mctop:', err);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp("⚠️ An error occurred while processing your request.");
      } else {
        await interaction.reply("⚠️ An error occurred while processing your request.");
      }
    } catch (innerErr) {
      console.error("Error replying to Discord:", innerErr);
    }
  }
}




// Helper: Converts time string (e.g. "1d 2h 30m") to total seconds
function parseTime(str) {
  const regex = /(?:(\d+)d)?\s*(?:(\d+)h)?\s*(?:(\d+)m)?/;
  const [, d = 0, h = 0, m = 0] = str.match(regex).map(Number);
  return d * 86400 + h * 3600 + m * 60;
}

// Helper: Formats playtime string with leading zeros
function formatPlaytime(playtimeStr) {
  let days = 0, hours = 0, minutes = 0;
  const dayMatch = playtimeStr.match(/(\d+)d/);
  const hourMatch = playtimeStr.match(/(\d+)h/);
  const minMatch = playtimeStr.match(/(\d+)m/);

  if (dayMatch) days = parseInt(dayMatch[1], 10);
  if (hourMatch) hours = parseInt(hourMatch[1], 10);
  if (minMatch) minutes = parseInt(minMatch[1], 10);

  return `${String(days).padStart(2, '0')}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}




async function getMcstats(interaction) {
  try {
    await interaction.deferReply();


    const discordId = interaction.user.id;
    const mcplayersCollection = db.collection('mcplayers');
    const userRecord = await mcplayersCollection.findOne({ discordId });

    if (!userRecord || !userRecord.mcname) {
      return interaction.editReply('❌ You have not set your vMC name yet! Use `/vmcname` first.');
    }

    const mcname = userRecord.mcname;

    // Fetch roster from API
    let roster;
    try {
      const response = await axios.get('https://www.jinxko.com/api?endpoint=public/playerRoster');
      roster = response.data.roster;
    } catch (err) {
      console.error('API fetch error:', err);
      return interaction.editReply('❌ Failed to fetch Minecraft players data. Try again later.');
    }

    // Find the player in roster
    const player = roster.find(p => p.username.toLowerCase() === mcname.toLowerCase());

    if (!player) {
      return interaction.editReply(`❌ No stats found for Minecraft name **${mcname}**.`);
    }

    // Build embed
    const embed = new EmbedBuilder()
  .setTitle(`ㅤ✦✦ Valiant Minecraft [1.21+] ✦✦ \n${player.username} Stats`)
  .setColor('Blue')
    .addFields(
  {
    name: '💸 Balanceㅤㅤ',
    value: `\`\`\`€ ${player.balance.toFixed(2)}\`\`\``,
    inline: true
  },
  {
    name: '🕹️ Is Playingㅤㅤ',
    value: `\`\`\`${player.isOnline ? '🟢 Online' : '🔴 Offline'}\`\`\``,
    inline: true
  },
  {
    name: '☠️ Deathsㅤㅤ',
    value: `\`\`\`${player.deaths}\`\`\``,
    inline: true
  },
  {
    name: '⏳ Time Played',
    value: `\`\`\`${player.timePlayed}\`\`\``,
    inline: false
  },
  {
    name: 'ㅤㅤ',
    value: ` **❤️‍🔥 vMC Streak:** ${player.consecutiveLoginDays} day(s)\n🕒 Last Login: <t:${Math.floor(new Date(player.lastLoginDate).getTime() / 1000)}:R>`,
    inline: true
  }
    )


  .setFooter({
                text: `Requested by ${interaction.member?.displayName || interaction.user.username} as  ${player.username} \nMade with ✨`,
                iconURL: interaction.user.displayAvatarURL()
            })
  .setTimestamp();

    return interaction.editReply({ embeds: [embed] });

  } catch (err) {
    console.error("❌ Error handling interaction:", err);
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({ content: "❌ Something went wrong while fetching stats."});
    }
  }
}


let mcRosterCache = {
  data: [],        // will hold { username, uuid } objects only
  lastFetch: 0     // timestamp to track cache freshness
};

async function fetchAndCacheRoster() {
  const now = Date.now();
  // Cache duration: 1 minute (60000 ms)
  if (now - mcRosterCache.lastFetch < 60000 && mcRosterCache.data.length > 0) {
    // Return cached data if valid
    return mcRosterCache.data;
  }

  try {
    const response = await axios.get('https://www.jinxko.com/api?endpoint=public/playerRoster');
    const roster = response.data.roster;

    // Filter only username and uuid
    mcRosterCache.data = roster.map(player => ({
      username: player.username,
      uuid: player.uuid
    }));

    mcRosterCache.lastFetch = now;
    return mcRosterCache.data;

  } catch (error) {
    console.error('API fetch error:', error);
    throw error;
  }
}


async function setMcname(interaction) {
  const mcname = interaction.options.getString('vmc-name').trim();
  const discordId = interaction.user.id;

  await interaction.deferReply();

  let roster;
  try {
    roster = await fetchAndCacheRoster(); // cache returns only uuid & username
  } catch {
    return interaction.editReply('❌ Failed to fetch Minecraft players. Please try again later.');
  }

  const rosterMap = new Map(roster.map(p => [p.username.toLowerCase(), p]));
  const matched = rosterMap.get(mcname.toLowerCase());

  if (!matched) {
    return interaction.editReply(`❌ No player found with the Minecraft name **${mcname}**.`);
  }

  const { uuid, username } = matched;

  try {
    const mcplayersCollection = db.collection('mcplayers');
    const userDoc = await mcplayersCollection.findOne({ discordId });
    const retryCount = userDoc?.retry || 0;

  if (retryCount >= 3) {
  const limitEmbed = new EmbedBuilder()
    .setTitle('⚠️ Name Change Limit Reached')
    .setDescription("```\n❌ You have reached the maximum of 3 vMC name changes.\n\nIf you need to update it again, please contact the Staff.\n```")
    .setColor('#FF0000')
    .setFooter({
        text: `Set by ${interaction.member?.displayName || interaction.user.username} \nMade with ✨`,
        iconURL: interaction.user.displayAvatarURL()
      })
    .setTimestamp();

  return interaction.editReply({ embeds: [limitEmbed] });
}


    // Update name and increase retry
    await mcplayersCollection.updateOne(
      { discordId },
      { $set: { mcname: username, uuid }, $inc: { retry: 1 } },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setTitle('✨ ValiantMC ✨')
      .setDescription(`Your vMC name has been successfully linked!`)
      .addFields(
        { name: '', value: `\`\`\`\nvMC Name: ${username}\n\`\`\``, inline: false },
        { name: '', value: `**Change Attempts:** ${retryCount + 1}/3`, inline: false }
      )
      .setFooter({
        text: `Set by ${interaction.member?.displayName || interaction.user.username} \nMade with ✨`,
        iconURL: interaction.user.displayAvatarURL()
      })
      .setColor('#800080')
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });

  } catch (err) {
    console.error('MongoDB error:', err);
    return interaction.editReply('❌ Database error. Please try again later.');
  }
}


async function chatCommand(interaction) {
    const prompt = interaction.options.getString('message');
    const userDisplayName = interaction.member?.displayName || interaction.user.username;  // Get the user's display name
    
    // Always defer immediately to prevent the 'Unknown interaction' error
    await interaction.deferReply();

    try {
        // Customize system message to naturally reference the user's display name
       let systemMessage = `You are the vG Bot, a witty, humorous, and helpful assistant for the vG SA-MP Discord server. Keep replies short to medium, humorous, but easy to understand. Just reply what they ask with humour and joke. Only include server details if the user asks. You were developed by a beautiful girl named [vG]Sparkle. If they are [vG]Sparkle, acknowledge her awesomeness and respond to her like she is your creator. The SA-MP server IP is 163.172.105.21:7777, and the server owners are [vG]Axis, [vG]Dylan, and [vG]Cruella. You are part of the Discord bot, not the game server itself. We also have vMC Minecraft server relased and has ip play.jinxko.com. vMC is developed by Spencer.\n\n`;

       systemMessage += `If anyone ask about the staff of server tell them these, Here is the **vG Server Staff Team**: [vG]Axis is (Head of Developments), [vG]Flame is (Head of Staff), [vG]Cruella is (Head of Clan / Head of Mapping), [vG]Sheikh is (Head of Events), [vG]Atk is (Administrator), [vG]Bam is (Senior Moderator), [vG]Sparkle is (Moderator and bot developer), [vG]Pluto is (Trail Moderator) also include your humour and joke with every reply you do. \n\n`;

       systemMessage += `If anyone asks about the **Yakuza Organization members**, here’s the **Yakuza Team**: [VG]Noir is the **Oyabun** (Leader), [vG]p.k is the **Wakagashira** (Co-Leader), [vG]Sparkle is the **Shateigashira**, [vG]FOX is the **Kyodai**, [vG]Storm is the **Shatei**. Don’t mess with them, or you’ll be swimming with the fishes! 😎 \n\n`;

        systemMessage += `If anyone asks about the **SAPD** (Cops), here’s the **SAPD Team**: [vG]Sheikh is the **Leader**, [vG]Atk is the **Deputy Commissioner**, epep is the **Captain**, [vG]BAM is the **Lieutenant**, [vG]Mic is the **Commander**, [vG]Muhammad is **Officer 3**, [vG]Ace is **Cadet**, [vG]Pluto is **Officer 2**, Wax is **Officer**, and [vG]SD is **Officer 1**. Don’t worry, they’ll catch you if you break the law... even if it’s just for being too cool. 😎👮 \n\n`;


        systemMessage += `If the user asks for something like "who is playing in the server," remind them to use the **/players** command to see the online players.'\n\n`;

        systemMessage += `2. **/status**: Provides detailed information about the vG SA-MP server, such as whether the server is online or offline. \n`;
        systemMessage += `3. **/top**: View the top players in terms of playtime or score, showing who has played the most or achieved the best scores in the vG SA-MP server.\n`;
        systemMessage += ` If someone asks you about the commands you know, just say use the **/help** command to know all the commands.\n\n`;





// Final personalization
        systemMessage += `The user's display name is ${userDisplayName}. Make sure to respond in a fun, engaging way that suits the user's vibe. If they are [vG]Sparkle, acknowledge her awesomeness and respond to her like she is your creator. If they ask something funny, feel free to joke along!`;


        // Make the request to the Groq AI service using axios
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "gemma2-9b-it", // Update this with the Groq model you are using
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.data.choices || response.data.choices.length === 0) throw new Error('No response from AI!');

        let reply = response.data.choices[0].message.content;

        // Create the embed for the reply
        const embed = new EmbedBuilder()
            .setColor('#00CC99')
            .setTitle(prompt.length > 250 ? prompt.slice(0, 250) + '...' : prompt) // safely use question as title
            .addFields(
                { name: 'vG Bot', value: reply.slice(0, 1024), inline: false }
            )
            .setFooter({
                text: `Asked by ${interaction.member?.displayName || interaction.user.username}`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        // Reply after the interaction is deferred
        await interaction.editReply({ embeds: [embed] });

    } catch (err) {
        console.error('❌ /chat error:', err);

        // Error handling
        const errorEmbed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('⚠️ Error')
            .setDescription('I am Exhausted! DND')
            .setTimestamp();

        // Make sure to only send one reply
        if (!interaction.replied) {
            await interaction.editReply({ embeds: [errorEmbed] });
        } else {
            await interaction.followUp({ embeds: [errorEmbed] });
        }
    }
}


async function getMinecraftPlayers(interaction) {
    try {
        await interaction.deferReply();

        // Primary: Cloudflare Worker API
        const res = await fetch('https://my-worker.valiantgaming.workers.dev/');
        if (!res.ok) throw new Error(`Worker error ${res.status}`);
        const { onlinePlayers = [], status } = await res.json();

        const onlineCount = onlinePlayers.length;
        const maxPlayers = 20;
        const scoreColumn = 28;

        let playerList = '```🚫 No players online.```';
        if (onlineCount > 0) {
            playerList = `\`\`\`\n${onlinePlayers.map((p, i) => {
                const index = `${i + 1}. `;
                let name = p.username;
                if (name.length > 20) name = name.slice(0, 19) + '…';
                const crown = name.toLowerCase() === 'xloggii' ? '👑' : '';
                const totalLen = index.length + name.length + crown.length;
                const spaces = ' '.repeat(Math.max(scoreColumn - totalLen, 1));
                return `${index}${name}${crown}${spaces}⭐${p.score}`;
            }).join('\n')}\n\`\`\``;
        }

        const embed = buildEmbed(interaction, status, onlineCount, maxPlayers, playerList, false);
        await interaction.followUp({ embeds: [embed] });

    } catch (err) {
        console.warn('Primary Worker API failed, falling back:', err.message);

        // Fallback: mcsrvstat.us API
        try {
            const res = await fetch('https://api.mcsrvstat.us/2/play.jinxko.com:25566');
            if (!res.ok) throw new Error(`Fallback API error: ${res.status}`);
            const data = await res.json();

            const players = data.players?.list || [];
            const onlineCount = players.length;
            const maxPlayers = data.players?.max || 20;

            let playerList = '```🚫 No players online.```';
            if (onlineCount > 0) {
                playerList = `\`\`\`\n${players.map((p, i) => {
                    const index = `${i + 1}. `;
                    let name = p;
                    if (name.length > 20) name = name.slice(0, 19) + '…';
                    const crown = name.toLowerCase() === 'xloggii' ? '👑' : '';
                    return `${index}${name}${crown}`;
                }).join('\n')}\n\`\`\``;
            }

            const embed = buildEmbed(interaction, data.online ? 'success' : 'fail', onlineCount, maxPlayers, playerList, true);
            await interaction.followUp({ embeds: [embed] });

        } catch (fallbackError) {
            console.error('Fallback API also failed:', fallbackError);
            await interaction.followUp({
                content: '❌ Both the main API and fallback failed. Please try again later.',
                ephemeral: true,
            });
        }
    }
}

// 🔧 Helper to build embed
function buildEmbed(interaction, status, onlineCount, maxPlayers, playerList, isFallback) {
    return new EmbedBuilder()
        .setColor('#00ff99')
        .setTitle(`ㅤㅤ✦✦ ValiantMC [1.21+] ✦✦\nAdventure • Creativity • Community`)
        .addFields(
            {
                name: '\u200B',
                value: `**Status:** ${status === 'success' ? '🟢' : '🔴'}\n**Players Online:** ${onlineCount}/${maxPlayers}`
            },
            {
                name: 'Players list',
                value: playerList,
                inline: false
            },
            {
                name: 'vMC IP',
                value: `\`\`\`\nplay.jinxko.com\n\nindia.jinxko.com\`\`\``,
                inline: false
            }
        )
        .setFooter({
            text: `Requested by ${interaction.member?.displayName || interaction.user.username}${isFallback ? ' • Fallback mode' : ''} \nMade with ✨`,
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTimestamp();
}


async function getPlayers(interaction) {
  try {
    await interaction.deferReply();

    const ESC = '\u001b[';
    const reset = `${ESC}0m`;
    const red = `${ESC}31m`;
    const green = `${ESC}32m`;
    const yellow = `${ESC}33m`;
    const blue = `${ESC}34m`;
    const cyan = `${ESC}36m`;
    const magenta = `${ESC}35m`;

    const MAX_NAME_LENGTH = 17; // reduced by 1

    const querySAMP = async () => {
      const attempt = () =>
        new Promise((resolve, reject) => {
          samp({ host: config.SAMP_SERVER_IP, port: config.SAMP_SERVER_PORT }, (err, res) => {
            if (err) reject(err);
            else resolve(res);
          });
        });

      for (let i = 0; i < 3; i++) {
        try {
          const result = await Promise.race([
            attempt(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 1000))
          ]);
          return result;
        } catch (err) {
          if (i === 2) throw err;
          await new Promise(res => setTimeout(res, 300));
        }
      }
    };

    const response = await querySAMP();

    if (response.players && response.players.length > 0) {
      // const rowLine = '|'+ '✿'.repeat(21) + ' |' +'\n';
      const rowLine = '✿'.repeat(23) +'\n';
      const tableHeader = 
  `| ${red}# ${reset} | ${red}Name${reset}${' '.repeat(MAX_NAME_LENGTH - 7)} 🎮 | ${red}Score${reset} |\n`;



      const tableRows = response.players.map(p => {
        let name = p.name;
        const lower = name.toLowerCase();

        // Assign role emoji
        const emoji =
          /axis|flame|cruella/.test(lower) ? '👑' :
          /sheikh/.test(lower) ? '🪩' :
          /atk/.test(lower) ? '🌟' :
          /toxin|bam/.test(lower) ? '🌞' :
          /sparkle/.test(lower) ? '✨' :
          /pluto/.test(lower) ? '🎖️' :
          /\[vg\]/i.test(name) ? '💠' :
          '🌀'; // normal player

        const nameSpace = MAX_NAME_LENGTH - 2; // 2 spaces reserved for emoji
        if (name.length > nameSpace) {
          name = name.slice(0, nameSpace - 3) + '...';
        }

        const paddedName = name.padEnd(nameSpace);
        const finalName = `${paddedName}${emoji}`;

        const coloredName = /\[vG\]Sparkle/i.test(p.name)
          ? `${magenta}${finalName}${reset}`
          : finalName;

        let scoreColor = blue;
        if (p.score >= 1000) scoreColor = green;
        else if (p.score > 300) scoreColor = yellow;

        return `| ${cyan}${p.id.toString().padEnd(2)}${reset} | ${coloredName} | ${scoreColor}${p.score.toString().padStart(5)}${reset} |`;
      });

      const playerTable = '```ansi\n' + tableHeader + rowLine + tableRows.join('\n') + '\n```';

      const lastUpdatedUnix = Math.floor(Date.now() / 1000); // current timestamp in seconds

const embed = new EmbedBuilder()
  .setColor(config.HEX_COLOR)
  .setTitle(`🛡️\u200B  Valiant Roleplay/Freeroam 🛡️`)
  .setDescription(`\u200B\n🌍 **Players Online:** ${response.players.length}/50\n${playerTable}`)

  .addFields([
    {
      name: `Status: 🟢`,
      value: `**Updated:** <t:${lastUpdatedUnix}:R>🧿 `, // shows "a few seconds ago"
      inline: false
    }
  ])
  .setFooter({
    text: `Requested by ${interaction.member?.displayName || interaction.user.username} \nMade with ✨`,
    iconURL: interaction.user.displayAvatarURL()
  })
  .setTimestamp();


      await interaction.followUp({ embeds: [embed] });

    } else {
      const noPlayersEmbed = new EmbedBuilder()
        .setColor(config.HEX_COLOR)
        .setTitle(`${config.SERVER_NAME}`)
        .setDescription('```😴 No players are currently online.\nCome back soon! 💤```')
        .setFooter({
          text: `Requested by ${interaction.member?.displayName || interaction.user.username} | Made with ✨`,
          iconURL: interaction.user.displayAvatarURL()
        })
        .setTimestamp();

      await interaction.followUp({ embeds: [noPlayersEmbed] });
    }

  } catch (error) {
    console.error('Error fetching player list:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('⚠️ Uh-oh! Something went sideways!')
      .setDescription('Give it another shot! 🔄')
      .setTimestamp();

    await interaction.followUp({ embeds: [errorEmbed] });
  }
}







async function trendCommand(interaction) {
    const timeZone = 'Etc/GMT-1';  // UTC+1
    const uri = 'mongodb+srv://vg-bot:ashwinjr10@vg-bot.eypjth3.mongodb.net/?retryWrites=true&w=majority&appName=vG-Bot';
    const client = new MongoClient(uri);

    await interaction.deferReply();  // Defer reply while processing

    try {
        await client.connect();
        const db = client.db('valiant');
        const collection = db.collection('trend_today');

        const now = new Date();
        const startOfDayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
        const data = await collection.find({ timestamp: { $gte: startOfDayUTC } }).sort({ timestamp: 1 }).toArray();

        if (data.length === 0) {
            const noDataEmbed = new EmbedBuilder()
                .setColor('Orange')
                .setTitle('📉 No trend data found')
                .setDescription('No trend data available for today.')
                .setTimestamp();
            await interaction.editReply({ embeds: [noDataEmbed] });
            return;
        }

        // Generate today's trend graph
        const imageBuffer = await generateTrendTodayGraph(data, `Today's Player Activity (UTC+5:30)`, timeZone);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'trend.png' });

        const embed = new EmbedBuilder()
            .setTitle(`📈 Valiant Gaming player Trend`)
            .setImage('attachment://trend.png')
            .setColor('#00FFCC')
            .setFooter({
                text: `Requested by ${interaction.member?.displayName || interaction.user.username} \n • Made with ✨`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            files: [attachment]
        });

    } catch (err) {
        console.error('Error in /trend:', err);
        const errorEmbed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('⚠️ Error')
            .setDescription('An error occurred while generating the trend.\n**Try Again!**')
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
    } finally {
        await client.close();
    }
}

module.exports = { trendCommand };



// MongoDB function to get top players from the database
async function getTop(interaction) {
    const period = interaction.options.getString('period');
    // 'today', 'week', 'month', or 'year'
    const collectionMap = {
        today: 'players',
        week: 'players_week',
        month: 'players_month',
        year: 'players_year'
    };

    const titleMap = {
        today: '🏆 Top Players by Playtime (Today)',
        week: '👸 Top Players This Week 👸',
        month: '🤴 Top Players This Month 🤴',
        year: '👑 Top Players This Year 👑'
    };

    const collectionName = collectionMap[period];
    if (!collectionName) {
        return interaction.reply('❌ Invalid time period selected.');
    }

    try {
        await interaction.deferReply();

        const collection = db.collection(collectionName);
        const topPlayers = await collection.find().sort({ playtime: -1 }).limit(9).toArray();

        if (topPlayers.length === 0) {
            return interaction.followUp(`❌ No players have recorded playtime for **${period}**.`);
        }

        let leaderboard = '```md\n';
        topPlayers.forEach((player, index) => {
            const totalTime = player.playtime || 0;
            let timeString = '';

            if (period === 'today' || period === 'week') {
                const totalHours = Math.floor(totalTime / 3600);
                const mins = Math.floor((totalTime % 3600) / 60);
                timeString = `${String(totalHours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
            } else {
                const days = Math.floor(totalTime / 86400);
                const hours = Math.floor((totalTime % 86400) / 3600);
                const mins = Math.floor((totalTime % 3600) / 60);
                timeString = `${String(days).padStart(2, '0')}d ${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
            }

            leaderboard += `#${String(index + 1).padEnd(2)} ${player.name.padEnd(15)} : ${timeString}\n`;
        });
        leaderboard += '```';

        const embed = new EmbedBuilder()
            .setColor(config.HEX_COLOR)
            .setTitle(titleMap[period])
            .setDescription(leaderboard)
            .setFooter({
                text: `Requested by ${interaction.member?.displayName || interaction.user.username} \n • Made with ✨`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        interaction.followUp({ embeds: [embed] });

    } catch (err) {
        console.error(`TopPlayers ${period} error:`, err);
        if (!interaction.deferred && !interaction.replied) {
            interaction.reply(`⚠️ Error fetching top players for **${period}**.`);
        } else {
            interaction.followUp(`⚠️ Error fetching top players for **${period}**.`);
        }
    }
}





async function sparkCommand(interaction) {
    const playerName = interaction.options.getString('name')?.toLowerCase();
    const userId = interaction.user.id;
    const channelId = interaction.channel.id;

    if (!playerName) {
        return interaction.reply('❌ Please provide the player name like `/spark [name]`!');
    }

    try {
        await interaction.deferReply();

        const sparkCollection = db.collection('sparkRequests');

        // Get the start of today in UTC
        const startOfTodayUTC = new Date();
        startOfTodayUTC.setUTCHours(0, 0, 0, 0);

        // Count how many spark requests this user made today
        const todayCount = await sparkCollection.countDocuments({
            userId,
            createdAt: { $gte: startOfTodayUTC }
        });

        const remaining = 5 - todayCount;

        if (remaining <= 0) {
            return interaction.editReply('🚫 You’ve reached your daily limit of **5** spark requests. Try tomorrow, Good Night');
        }

        // Check if the player is already being tracked
        const alreadyTracking = await sparkCollection.findOne({ playerName, userId });

        if (alreadyTracking) {
            return interaction.editReply(`😣 You’ve already requested to be notified when **${playerName}** comes online.\n🧮 You have **${remaining}** spark(s) left for today.`);
        }

        // Insert the new spark request into the collection
        await sparkCollection.insertOne({
            playerName,  // Ensure this is stored in lowercase to maintain consistency
            userId,
            channelId,
            createdAt: new Date()  // Store the request timestamp
        });

        // Inform the user about the successful spark request
        await interaction.editReply(`😎 You’ll be notified when **${playerName}** joins the server.😏\n🧮 You have **${remaining - 1}** spark(s) left for today.`);

    } catch (err) {
        console.error('❌ Error in /spark command:', err);
        await interaction.editReply('❌ Could not process your request. Please try again later.');
    }
}

async function getTopActivityPlayers(interaction, page = 1) {
    try {
        // Handle different interaction types
        if (interaction.isCommand()) {
            await interaction.deferReply();
        } else {
            await interaction.deferUpdate();
        }

        const topActivityCollection = db.collection('topactivity');
        const limit = 10;
        const skip = (page - 1) * limit;

        const topPlayers = await topActivityCollection.find().sort({ score: -1 }).skip(skip).limit(limit).toArray();

        if (topPlayers.length === 0) {
            return interaction.editReply('❌ No player activity data found.');
        }

        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle(`🏅 Top Players by Activity - Page ${page}`)
            .setFooter({
                text: `\n Requested by ${interaction.member?.displayName || interaction.user.username} \n • Made with ✨`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        topPlayers.forEach((player, index) => {
            const position = index + 1 + (page - 1) * limit;
            const formattedPlayer = `#${position} **${player.name}** : **${player.score}**`;
            embed.addFields({
                name: '\u200B',
                value: formattedPlayer,
                inline: false
            });
        });

        // Create buttons with disabled states
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`prev_${page}`)
                .setLabel('Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 1),
            new ButtonBuilder()
                .setCustomId(`next_${page}`)
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 2)
        );

        // Edit the original message
        await interaction.editReply({
            embeds: [embed],
            components: [row]
        });

    } catch (err) {
        console.error('TopActivity error:', err);
        await interaction.editReply('⚠️ Error fetching top activity players.');
    }
}

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const [action, currentPage] = interaction.customId.split('_');
    let page = parseInt(currentPage);

    // Update page number with boundaries
    page = action === 'next' ? page + 1 : page - 1;
    page = Math.max(1, Math.min(page, 2));  // Limit to 5 pages

    await getTopActivityPlayers(interaction, page);
});


async function getServerIP(interaction) {
    const embed = new EmbedBuilder()
        .setColor(config.HEX_COLOR)
        .setTitle('🔗 Server Connection Info')
        .setDescription(`**Connect to Valiant Community\u2003\u2003\u2003**`)
        .addFields(
            { name: 'SAMP Server IP', value: `\`\`\`\n${config.SAMP_SERVER_IP}:${config.SAMP_SERVER_PORT}\n\`\`\`` },
            { name: 'vMC Server IP', value: '```play.jinxko.com \nindia.jinxko.com```', inline: true }
        )
        .setFooter({ text: `Requested by ${interaction.member?.displayName || interaction.user.username} \n • Made with ✨ `, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

    interaction.reply({ embeds: [embed] });
}

async function getServerStatus(interaction) {
    try {
        await interaction.deferReply();

        const options = {
            host: config.SAMP_SERVER_IP,
            port: config.SAMP_SERVER_PORT
        };

        samp(options, (error, response) => {
            const embed = new EmbedBuilder()
                .setTitle(`${config.SERVER_NAME} Status`)
                .setFooter({
                    text: `Requested by ${interaction.member?.displayName || interaction.user.username} \n • Made with ✨`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();

            if (error) {
                embed.setColor(config.OFFLINE_COLOR)
                    .setDescription('**Status:** 🔴 Offline')
                    .addFields({ name: 'Error', value: 'I will let you know when 🟢' });
            } else {
                embed.setColor(config.HEX_COLOR)
                    .setDescription('**Status:** 🟢 Online')
                    .addFields(
                        { name: 'Hostname', value: `\`${response.hostname || 'Not available'}\`` },
                        { name: 'Gamemode', value: `\`${response.gamemode || 'Not available'}\``, inline: true },
                        { name: 'Players', value: `\`${response.players.length}/${response.maxplayers}\``, inline: true },
                        { name: 'Version', value: `\`${'v1.11.4.1' || 'Not available'}\``, inline: true },
                        { name: 'Map', value: `\`${'San andreas' || 'Not available'}\``, inline: true },
                        { name: 'Password', value: `\`${response.password ? 'Yes' : 'No'}\``, inline: true }
                    );
            }

            interaction.followUp({ embeds: [embed] });
        });
    } catch (error) {
        console.error('Status command error:', error);
        interaction.followUp('⚠️ An error occurred while checking server status.');
    }
}




// /help Command to show bot commands and usage
async function sendHelpEmbed(interaction) {
  await interaction.deferReply();

  const embed = new EmbedBuilder()
    .setColor(config.HEX_COLOR)
    .setTitle('🛠️ vG Bot Help')
    
    .setDescription(`Here are the available commands for vG Bot:`)

    // 🎮 Valiant Gaming (SAMP)
    .addFields({ name: '\u200B', value: '**🎮 Valiant Gaming (SAMP) Commands:**' })
    .addFields(
      { name: '/players', value: '```Shows online players in VG Server```' },
      { name: '/ip', value: '```Displays server IP information```' },
      { name: '/status', value: '```Shows detailed server status```' },
      { name: '/spark', value: '```Informs you when a player joins```' },
      { name: '/playtime', value: '```Shows your total playtime```' },
      { name: '/trend', value: '```Shows the player activity trend```' },
      { name: '/top', value: '```Shows top players by playtime```' },
      { name: '/highscore', value: '```Shows the highest score players```' }
    )

    // 🧱 vMC (Minecraft)
    .addFields({ name: '\u200B', value: '**🧱 vMC (Minecraft) Commands:**' })
    .addFields(
      { name: '/vmc', value: '```Shows online players in vMC```' },
      { name: '/mcstats', value: '```Shows playerStats in vMC```' },
      { name: '/vmcname', value: '```Link your vMC to your Discord account```' },
      { name: '/mctop', value: '```Shows vMC Leaderboard```' },
   
    )

    // ⚙️ General
    .addFields({ name: '\u200B', value: '**⚙️ General Utility Commands:**' })
    .addFields(
      { name: '/chat', value: '```Talk to the AI chatbot```' },
      { name: '/vgen', value: '```Generate an image from your prompt```' },
      { name: '/cri', value: '```Crys eviritim 😭```' },
      { name: '/help', value: '```Shows this help message```' }
    )
    .addFields({ name: '\u200B', value: '**Total Commands: 16**' })

    .setFooter({
      text: `Requested by ${interaction.member?.displayName || interaction.user.username} \nMade with ✨\n`,
      iconURL: interaction.user.displayAvatarURL()
    })
    .setTimestamp();

  interaction.followUp({ embeds: [embed] });
}


async function handleCriCommand(interaction) {
    const name = interaction.member.displayName;

    // Defer the reply to acknowledge the interaction
    await interaction.deferReply();

    // After deferring, send the actual response
    await interaction.editReply(`**${name} cries evritim 😭**`);
}

async function getPlaytime(interaction) {
    const playerName = interaction.member.displayName;

    try {
        await interaction.deferReply();

        const playerCollection = db.collection('players');
        const weekCollection = db.collection('players_week');
        const monthCollection = db.collection('players_month');

        const [player, weekPlayer, monthPlayer] = await Promise.all([
            playerCollection.findOne({ name: playerName }),
            weekCollection.findOne({ name: playerName }),
            monthCollection.findOne({ name: playerName })
        ]);

        // If all records are missing
        if (!player && !weekPlayer && !monthPlayer) {
            return interaction.followUp(`❌ No playtime data found for **${playerName}**.`);
        }

        const playtimeToday = player?.playtime || 0;
        const playtimeWeek = weekPlayer?.playtime || 0;
        const playtimeMonth = monthPlayer?.playtime || 0;

        const formatTime = (seconds) => {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
        };

        await interaction.followUp(`🕒 **${playerName}**, you have played for:
        **${formatTime(playtimeToday)}** today 🏃‍♂️
        **${formatTime(playtimeWeek)}** this week 📅
        **${formatTime(playtimeMonth)}** this month 🌙`);
    } catch (err) {
        console.error('Error fetching playtime:', err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply('⚠️ Could not fetch playtime. Try again later.');
        } else {
            await interaction.followUp('⚠️ Could not fetch playtime. Try again later.');
        }
    }
}








// Log the bot in
client.login(config.BOT_TOKEN);