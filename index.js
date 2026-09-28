const TOKENS = process.env.BOT_TOKENS.split(',').map(t => t.trim());
const GUILD_ID = process.env.GUILD_ID;
const INTERVAL_MS = 1000;
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
    console.warn(`[rate limit] retrying after ${retryAfter}ms`);
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

// self-scheduling loop — each send waits for the last to finish
// so rate limit retries never stack up or block other bots
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
    console.error(`[Bot ${index}] send failed:`, err.message);
  }
  // schedule next send only after this one fully resolves
  setTimeout(() => spamLoop(token, channelId, index), INTERVAL_MS);
}

async function main() {
  console.log('Setting up channels...');
  const channelIds = await setupChannels();
  console.log('All channels ready, starting bots...');

  // start each bot with a small offset so they don't all fire at once
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
