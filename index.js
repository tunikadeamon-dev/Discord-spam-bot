const TOKENS = process.env.BOT_TOKENS.split(',').map(t => t.trim());
const GUILD_ID = process.env.GUILD_ID;
const INTERVAL_MS = 2000;
const MESSAGES = ['🔔', 'ping!', 'notif', '💥', 'wake up', '📣'];
const API = 'https://discord.com/api/v10';

// per-bot cooldown tracker — if rate limited, skip sends until cooldown expires
const cooldowns = {};

async function post(token, path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    const wait = ((data.retry_after || 5) * 1000);
    console.warn(`[rate limit] wait ${wait}ms`);
    return { rateLimited: true, wait };
  }

  return { ok: res.ok, status: res.status };
}

async function get(token, path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  return res.json();
}

async function setupChannels() {
  const token = TOKENS[0];
  const existing = await get(token, `/guilds/${GUILD_ID}/channels`);

  let category = existing.find(c => c.type === 4 && c.name === 'SPAM ZONE');
  if (!category) {
    const res = await fetch(`${API}/guilds/${GUILD_ID}/channels`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'SPAM ZONE', type: 4 }),
    });
    category = await res.json();
    console.log('Created category: SPAM ZONE');
  }

  const channelIds = await Promise.all(TOKENS.map(async (_, i) => {
    const name = `spam-${i + 1}`;
    const found = existing.find(c => c.type === 0 && c.name === name);
    if (found) { console.log(`Reusing: ${name}`); return found.id; }
    const res = await fetch(`${API}/guilds/${GUILD_ID}/channels`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type: 0, parent_id: category.id }),
    });
    const ch = await res.json();
    console.log(`Created: ${name}`);
    return ch.id;
  }));

  return channelIds;
}

function spamLoop(token, channelId, index) {
  setInterval(async () => {
    // skip this tick if we're in a rate limit cooldown
    if (cooldowns[index] && Date.now() < cooldowns[index]) return;

    const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    try {
      const result = await post(token, `/channels/${channelId}/messages`, {
        content: `@everyone ${msg}`,
        allowed_mentions: { parse: ['everyone'] },
      });

      if (result.rateLimited) {
        // set cooldown and skip — next ticks will resume automatically after
        cooldowns[index] = Date.now() + result.wait;
      }
    } catch {
      // network error — just skip this tick, next one fires in INTERVAL_MS
    }
  }, INTERVAL_MS);
}

async function main() {
  console.log('Setting up channels...');
  const channelIds = await setupChannels();
  console.log('All channels ready, starting bots...');

  TOKENS.forEach((token, i) => {
    setTimeout(() => {
      console.log(`[Bot ${i}] started`);
      spamLoop(token, channelIds[i], i);
    }, i * 300);
  });
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
