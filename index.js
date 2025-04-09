const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const triggersPath = path.join(__dirname, 'triggers.json');
let triggers = fs.existsSync(triggersPath)
  ? JSON.parse(fs.readFileSync(triggersPath, 'utf-8'))
  : {};

function saveTriggers() {
  fs.writeFileSync(triggersPath, JSON.stringify(triggers, null, 2));
}

function isValidImageURL(url) {
  return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(url);
}

client.on('ready', () => {
  console.log(`🟢 Logged in as ${client.user.tag}`);
});

function parseTime(str) {
  const match = str.match(/(\d+)([smhd])/);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2];
  const multiplier = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * multiplier[unit];
}

const protectedActions = [
  AuditLogEvent.ChannelDelete,
  AuditLogEvent.RoleDelete,
  AuditLogEvent.BotAdd
];

client.on('guildAuditLogEntryCreate', async (entry, guild) => {
  if (!protectedActions.includes(entry.action)) return;

  const executor = entry.executor;
  if (!guild.members.me.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  const member = await guild.members.fetch(executor.id).catch(() => null);
  if (!member || member.id === guild.ownerId || member.id === client.user.id) return;

  try {
    await member.kick('Anti-nuke: Unauthorized action');
    const logChannel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me).has('SendMessages'));
    if (logChannel) {
      logChannel.send(`⚠️ **Anti-Nuke Triggered:** ${executor.tag} was kicked for attempting: **${entry.action}**`);
    }
  } catch (err) {
    console.error('Anti-nuke error:', err);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const content = message.content.trim();
  const args = content.split(/\s+/);
  const command = args.shift().toLowerCase();

  const lowerContent = content.toLowerCase();
  if (triggers[lowerContent]) {
    const trigger = triggers[lowerContent];
    if (trigger.type === 'text') {
      message.channel.send(trigger.response);
    } else if (trigger.type === 'image') {
      const embed = new EmbedBuilder().setTitle('🎯 Triggered Image').setImage(trigger.response).setColor('Purple');
      message.channel.send({ embeds: [embed] });
    }
    return;
  }

  const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
  const filter = (m) => m.author.id === message.author.id;

  if (command === '!arise') {
    const embed = new EmbedBuilder()
      .setTitle('⚔️ Igris Has Awakened!')
      .setDescription('Summoned by the shadows, Igris stands ready.\n\n**How can I assist you today, master?**')
      .setColor('DarkPurple')
      .setFooter({ text: `⚔️ ${message.member.displayName}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();
    message.channel.send({ embeds: [embed] });

  } else if (command === '!avatar') {
    const user = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s Avatar`)
      .setImage(user.displayAvatarURL({ size: 1024 }))
      .setColor('Blue');
    message.channel.send({ embeds: [embed] });

  } else if (command === '!help') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('🛡️ Igris Bot Help')
      .setColor('Blue')
      .setDescription(`Here's a list of available commands:`)
      .addFields(
        { name: '!arise', value: 'Summon Igris from the shadows.' },
        { name: '!avatar', value: 'Get your or a mentioned user\'s avatar.' },
        { name: '!remindme <time> <message>', value: 'Set a personal reminder.' },
        { name: '!countdown <time>', value: 'Start a countdown timer and get notified when it ends.' },
        { name: '!addtrigger', value: 'Add a custom trigger (admin only).' },
        { name: '!removetrigger', value: 'Remove a trigger (admin only).' },
        { name: '!edittrigger', value: 'Edit an existing trigger (admin only).' },
        { name: '!listtriggers', value: 'List all custom triggers.' },
        { name: '!cleartriggers', value: 'Clear all custom triggers (admin only).' },
        { name: '!kick @user [reason]', value: 'Kick a user from the server (admin only).' },
        { name: '!ban @user [reason]', value: 'Ban a user from the server (admin only).' },
        { name: '!unban userid', value: 'Unban a user by ID (admin only).' },
        { name: '!timeout @user <duration>', value: 'Timeout a user (admin only).' }
      );
    message.channel.send({ embeds: [helpEmbed] });

  } else if (command === '!remindme') {
    const timeStr = args.shift();
    const reminderMsg = args.join(' ');
    const duration = parseTime(timeStr);
    if (!duration || !reminderMsg) return message.reply('Invalid format. Use `!remindme 10m Take a break`.');
    setTimeout(() => {
      message.reply(`⏰ Reminder: ${reminderMsg}`);
    }, duration);
    message.reply(`✅ Reminder set for ${timeStr}.`);

  } else if (command === '!countdown') {
    const timeStr = args.shift();
    const duration = parseTime(timeStr);
    if (!duration) return message.reply('Invalid format. Use `!countdown 1h`.');
    message.reply(`⏳ Countdown started for ${timeStr}...`);
    setTimeout(() => {
      message.channel.send(`⏰ <@${message.author.id}> Countdown for ${timeStr} has ended!`);
    }, duration);

  } else if (command === '!addtrigger' && isAdmin) {
    message.channel.send('Enter the trigger word:');
    const wordMsg = (await message.channel.awaitMessages({ filter, max: 1, time: 30000 })).first();
    const word = wordMsg?.content.toLowerCase();
    if (!word) return message.channel.send('⛔ Trigger setup cancelled.');

    message.channel.send('Is this a text or image trigger? (text/image)');
    const typeMsg = (await message.channel.awaitMessages({ filter, max: 1, time: 30000 })).first();
    const type = typeMsg?.content;
    if (!['text', 'image'].includes(type)) return message.channel.send('⛔ Invalid type. Cancelled.');

    message.channel.send('Enter the response content:');
    const responseMsg = (await message.channel.awaitMessages({ filter, max: 1, time: 60000 })).first();
    const response = responseMsg?.content;
    if (!response) return message.channel.send('⛔ Cancelled.');
    if (type === 'image' && !isValidImageURL(response)) return message.channel.send('⛔ Invalid image URL.');

    triggers[word] = { type, response };
    saveTriggers();
    message.channel.send(`✅ Trigger \`${word}\` added.`);

  } else if (command === '!removetrigger' && isAdmin) {
    const word = args[0]?.toLowerCase();
    if (!word || !triggers[word]) return message.reply('⛔ Trigger not found.');
    delete triggers[word];
    saveTriggers();
    message.reply(`✅ Trigger \`${word}\` removed.`);

  } else if (command === '!edittrigger' && isAdmin) {
    message.channel.send('Which trigger do you want to edit?');
    const wordMsg = (await message.channel.awaitMessages({ filter, max: 1, time: 30000 })).first();
    const word = wordMsg?.content.toLowerCase();
    if (!triggers[word]) return message.channel.send('⛔ Trigger not found.');

    message.channel.send('New type? (text/image)');
    const newTypeMsg = (await message.channel.awaitMessages({ filter, max: 1, time: 30000 })).first();
    const newType = newTypeMsg?.content;
    if (!['text', 'image'].includes(newType)) return message.channel.send('⛔ Invalid type.');

    message.channel.send('New response?');
    const newResponseMsg = (await message.channel.awaitMessages({ filter, max: 1, time: 60000 })).first();
    const newResponse = newResponseMsg?.content;
    if (!newResponse) return message.channel.send('⛔ Cancelled.');
    if (newType === 'image' && !isValidImageURL(newResponse)) return message.channel.send('⛔ Invalid image URL.');

    triggers[word] = { type: newType, response: newResponse };
    saveTriggers();
    message.channel.send(`✅ Trigger \`${word}\` updated.`);

  } else if (command === '!listtriggers') {
    if (!Object.keys(triggers).length) return message.channel.send('No triggers found.');
    const list = Object.entries(triggers).map(([key, val]) => `• **${key}** → ${val.type}`).join('\n');
    const embed = new EmbedBuilder().setTitle('🧠 Active Triggers').setDescription(list).setColor('Purple');
    message.channel.send({ embeds: [embed] });

  } else if (command === '!cleartriggers' && isAdmin) {
    triggers = {};
    saveTriggers();
    message.channel.send('✅ All triggers cleared.');

  } else if (command === '!kick' && isAdmin) {
    const user = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason';
    if (!user) return message.reply('Mention a valid user to kick.');
    try {
      await user.kick(reason);
      message.channel.send(`✅ ${user.user.tag} was kicked. Reason: ${reason}`);
    } catch {
      message.channel.send('⛔ Failed to kick.');
    }

  } else if (command === '!ban' && isAdmin) {
    const user = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason';
    if (!user) return message.reply('Mention a valid user to ban.');
    try {
      await user.ban({ reason });
      message.channel.send(`✅ ${user.user.tag} was banned. Reason: ${reason}`);
    } catch {
      message.channel.send('⛔ Failed to ban.');
    }

  } else if (command === '!unban' && isAdmin) {
    const userId = args[0];
    try {
      await message.guild.bans.remove(userId);
      message.channel.send(`✅ Unbanned user with ID: ${userId}`);
    } catch {
      message.channel.send('⛔ Failed to unban.');
    }

  } else if (command === '!timeout' && isAdmin) {
    const user = message.mentions.members.first();
    const durationStr = args[1];
    const reason = args.slice(2).join(' ') || 'No reason';
    const duration = parseTime(durationStr);
    if (!user || !duration) return message.reply('Usage: !timeout @user 10m Spamming');
    try {
      await user.timeout(duration, reason);
      message.channel.send(`✅ ${user.user.tag} has been timed out for ${durationStr}.`);
    } catch {
      message.channel.send('⛔ Failed to timeout user.');
    }
  }
});
const express = require("express");
const app = express();
const port = 3000;
app.listen(port, () => {
    console.log(`🔗 Listening to GlaceYT : http://localhost:${port}`);
});
client.login(process.env.TOKEN);