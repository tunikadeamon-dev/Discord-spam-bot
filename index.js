const TOKENS = process.env.BOT_TOKENS.split(',').map(t => t.trim());
const GUILD_ID = process.env.GUILD_ID;
const INTERVAL_MS = 1000;
const MESSAGES = ['🔔', 'ping!', 'notif', '💥', 'wake up', '📣'];
const API = 'https://discord.com/api/v10';

async function discordFetch(token, path, options = {}, retries = 5) {
  try {
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
      console.warn(`[rate limit] retrying after ${retryAfter}ms`);
      await new Promise(r => setTimeout(r, retryAfter));
      return discordFetch(token, path, options, retries);
    }

    if (res.status === 503 && retries > 0) {
      console.warn(`[503] retrying in 5s (${retries} left)`);
      await new Promise(r => setTimeout(r, 5000));
      return discordFetch(token, path, options, retries - 1);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }

    return res.status === 204 ? null : res.json();

  } catch (err) {
    // catches network-level errors (connection reset, no such file, etc.)
    if (retries > 0) {
      console.warn(`[network error] ${err.message} — retrying in 5s (${retries} left)`);
      await new Promise(r => setTimeout(r, 5000));
      return discordFetch(token, path, options, retries - 1);
    }
    throw err;
  }
}

async function setupChannels() {
  const token = TOKENS[0];
  const existing = await discordFetch(token, `/guilds/${GUILD_ID}/channels`);

  let category = existing.find(c => c.type === 4 && c.name === 'SPAM ZONE');
  if (!category) {
    category = await discordFetch(token, `/guilds/${GUILD_ID}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name: 'SPAM ZONE', type: 4 }),
    });
    console.log('Created category: SPAM ZONE');
  }

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

async function spamLoop(token, channelId, index) {
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
    console.error(`[Bot ${index}] send failed permanently:`, err.message);
  }
  setTimeout(() => spamLoop(token, channelId, index), INTERVAL_MS);
}

async function main() {
  console.log('Setting up channels...');
  const channelIds = await setupChannels();
  console.log('All channels ready, starting bots...');

  TOKENS.forEach((token, i) => {
    setTimeout(() => {
      console.log(`[Bot ${i}] started`);
      spamLoop(token, channelIds[i], i);
    }, i * (INTERVAL_MS / TOKENS.length));
  });
}

main().catch(err => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
