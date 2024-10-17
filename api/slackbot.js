const { App } = require('@slack/bolt');
const { Configuration, OpenAIApi } = require('openai');
require('dotenv').config();

// Initialize OpenAI API
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Initialize the Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse: true,
});

// Slack event listener for messages
app.message(async ({ event, say }) => {
  try {
    if (event.subtype && event.subtype === 'bot_message') return;

    console.log('Received message:', event.text);

    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: event.text }],
      temperature: 0.7,
      max_tokens: 500,
    });

    await say({
      text: completion.data.choices[0].message.content,
      thread_ts: event.thread_ts || event.ts,
    });

  } catch (error) {
    console.error('Error processing message:', error);
    await say({
      text: 'Sorry, I encountered an error processing your message.',
      thread_ts: event.thread_ts || event.ts,
    });
  }
});

// Vercel serverless function handler
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Handle Slack URL verification
  if (req.body && req.body.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  try {
    await app.processEvent(req.body);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error processing event:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

