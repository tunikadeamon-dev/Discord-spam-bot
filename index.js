const TOKENS = process.env.BOT_TOKENS.split(',').map(t => t.trim());
const GUILD_ID = process.env.GUILD_ID;
const INTERVAL_MS = 2000;
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

  if (res.status === 429) {
    const data = await res.json();
    const retryAfter = (data.retry_after || 1) * 1000;
    console.warn(`Rate limited, retrying after ${retryAfter}ms`);
    await new Promise(r => setTimeout(r, retryAfter));
    return discordFetch(token, path, options);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

async function setupChannels() {
  // use first token only for all setup
  const token = TOKENS[0];
  const existing = await discordFetch(token, `/guilds/${GUILD_ID}/channels`);

  // get or create category
  let category = existing.find(c => c.type === 4 && c.name === 'SPAM ZONE');
  if (!category) {
    category = await discordFetch(token, `/guilds/${GUILD_ID}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name: 'SPAM ZONE', type: 4 }),
    });
    console.log('Created category: SPAM ZONE');
  }

  // create all missing channels in parallel
  const channelIds = await Promise.all(TOKENS.map(async (_, i) => {
    const name = `spam-${i + 1}`;
    const found = existing.find(c => c.type === 0 && c.name === name);
    if (found) {
      console.log(`Reusing channel: ${name}`);
      return found.id;
    }
    const created = await discordFetch(token, `/guilds/${GUILD_ID}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name, type: 0, parent_id: category.id }),
    });
    console.log(`Created channel: ${name}`);
    return created.id;
  }));

  return channelIds;
}

async function sendMessage(token, channelId, index) {
  const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
  try {
    await discordFetch(token, `/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: `@everyone ${msg}`,
        allowed_mentions: { parse: ['everyone'] },
      }),
    });
  } catch (err) {
    console.error(`[Bot ${index}] send failed:`, err.message);
  }
}

async function main() {
  console.log('Setting up channels...');
  const channelIds = await setupChannels();
  console.log('All channels ready, starting bots...');

  // start all bots at once, each with a small offset so they don't fire simultaneously
  TOKENS.forEach((token, i) => {
    setTimeout(() => {
      console.log(`[Bot ${i}] started`);
      setInterval(() => sendMessage(token, channelIds[i], i), INTERVAL_MS);
    }, i * (INTERVAL_MS / TOKENS.length));
  });
}

main().catch(err => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
