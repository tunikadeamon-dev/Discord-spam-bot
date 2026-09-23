const { Client, GatewayIntentBits, ChannelType } = require('discord.js');

const TOKENS = process.env.BOT_TOKENS.split(',').map(t => t.trim());
const GUILD_ID = process.env.GUILD_ID;
const INTERVAL_MS = 1200;
const MESSAGES = ['🔔', 'ping!', 'notif', '💥', 'wake up', '📣'];
const USER_ID = process.env.USER_ID;

async function createNewChannel(guild) {
  let category = guild.channels.cache.find(c => c.name === 'SPAM ZONE' && c.type === ChannelType.GuildCategory);
  if (!category) {
    category = await guild.channels.create({ name: 'SPAM ZONE', type: ChannelType.GuildCategory });
  }

  const existing = guild.channels.cache.filter(c => c.name.startsWith('spam-'));
  const nums = existing.map(c => parseInt(c.name.split('-')[1])).filter(n => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;

  const channel = await guild.channels.create({
    name: `spam-${next}`,
    type: ChannelType.GuildText,
    parent: category.id,
  });

  console.log(`Created channel: spam-${next}`);
  return channel;
}

async function runBot(token, index) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

  client.once('ready', async () => {
    console.log(`[Bot ${index}] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await createNewChannel(guild);

    setInterval(() => {
      const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
      channel.send(`<@${USER_ID}> ${msg}`).catch(err => console.error(`[Bot ${index}] send failed:`, err.message));
}, INTERVAL_MS);
  });

  client.login(token).catch(err => console.error(`[Bot ${index}] login failed:`, err.message));
}

TOKENS.forEach((token, i) => runBot(token, i));

