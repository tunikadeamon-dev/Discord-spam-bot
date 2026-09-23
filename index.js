const TOKENS = process.env.BOT_TOKENS.split(',').map(t => t.trim());
const GUILD_ID = process.env.GUILD_ID;
const INTERVAL_MS = 800;
const MESSAGES = ['🔔', 'ping!', 'notif', '💥', 'wake up', '📣'];
const API = 'https://discord.com/api/v10';

async function discordFetch(token, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

async function getOrCreateChannel(token, botIndex) {
  const channels = await discordFetch(token, `/guilds/${GUILD_ID}/channels`);

  let category = channels.find(c => c.type === 4 && c.name === 'SPAM ZONE');
  if (!category) {
    category = await discordFetch(token, `/guilds/${GUILD_ID}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name: 'SPAM ZONE', type: 4 }),
    });
  }

  const channelName = `spam-${botIndex + 1}`;
  let channel = channels.find(c => c.type === 0 && c.name === channelName);

  if (!channel) {
    channel = await discordFetch(token, `/guilds/${GUILD_ID}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name: channelName, type: 0, parent_id: category.id }),
    });
    console.log(`Created channel: ${channelName}`);
  } else {
    console.log(`Reusing existing channel: ${channelName}`);
  }

  return channel;
}

async function runBot(token, index) {
  try {
    const channel = await getOrCreateChannel(token, index);
    console.log(`[Bot ${index}] ready, posting to ${channel.name}`);

    setInterval(async () => {
      const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
      try {
        await discordFetch(token, `/channels/${channel.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: `@everyone ${msg}`,
            allowed_mentions: { parse: ['everyone'] },
          }),
        });
      } catch (err) {
        console.error(`[Bot ${index}] send failed:`, err.message);
      }
    }, INTERVAL_MS);
  } catch (err) {
    console.error(`[Bot ${index}] setup failed:`, err.message);
  }
}

TOKENS.forEach((token, i) => runBot(token, i));
