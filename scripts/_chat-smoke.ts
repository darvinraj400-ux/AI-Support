import './_env';
import { randomUUID } from 'node:crypto';

async function chat(sessionId: string, message: string) {
  const res = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      messages: [{ role: 'user', content: message }],
    }),
  });
  const text = await res.text();
  console.log(`\nQ: ${message}`);
  console.log(`status: ${res.status}`);
  console.log(`X-Conversation-Id: ${res.headers.get('x-conversation-id')}`);
  console.log('body:', text);
}

async function main() {
  const s = randomUUID();
  await chat(s, 'How much does Nimbus cost?');
  await chat(s, 'Is there a free trial?');
  await chat(s, 'Do you sponsor my marathon?');       // expect no-match
  await chat(s, 'What about sponsoring my cat?');    // expect no-match -> handoff on 2nd
}

main().catch((e) => { console.error(e); process.exit(1); });
