const { App } = require('@slack/bolt');
const OpenAI = require('openai');
require('dotenv').config();

// Initialize OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize the Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse: true,
});

// Function to handle both message and app_mention events
const handleEvent = async ({ event, say }) => {
  try {
    // Ignore bot messages and messages without text
    if (event.bot_id || !event.text) return;

    console.log('Received event:', event.type, 'with text:', event.text);

    // Send the message content to OpenAI for a response
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: event.text }],
      temperature: 0.7,
      max_tokens: 500
    });

    // Send back the OpenAI-generated response to Slack
    await say({
      text: completion.choices[0].message.content,
      thread_ts: event.thread_ts || event.ts // This will reply in thread if message is in thread
    });

  } catch (error) {
    console.error('Error processing event:', error);
    await say({
      text: 'Sorry, I encountered an error processing your message.',
      thread_ts: event.thread_ts || event.ts
    });
  }
};

// Slack event listener for messages
app.event('message', handleEvent);

// Slack event listener for app mentions
app.event('app_mention', handleEvent);

// Vercel serverless function handler
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Handle Slack URL verification
  if (req.body.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  try {
    // Log the incoming request body for debugging
    console.log('Incoming request body:', JSON.stringify(req.body));

    // Check if the event is nested inside a 'payload' property (common with some Slack integrations)
    const eventBody = req.body.payload ? JSON.parse(req.body.payload) : req.body;

    // Process the event
    if (eventBody.event) {
      await handleEvent({ 
        event: eventBody.event, 
        say: async (response) => {
          // Use Slack's Web API to send the message
          await app.client.chat.postMessage({
            token: process.env.SLACK_BOT_TOKEN,
            channel: eventBody.event.channel,
            text: response.text,
            thread_ts: response.thread_ts
          });
          console.log('Response sent:', response);
        }
      });
      res.status(200).json({ ok: true });
    } else {
      throw new Error('No event found in the request body');
    }
  } catch (error) {
    console.error('Error processing event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
