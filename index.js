require('dotenv').config();
const { Bot, InlineKeyboard, GrammyError, HttpError } = require('grammy');
const { OpenAI } = require('openai');

const bot = new Bot(process.env.BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const userSessions = new Map();

const SYSTEM_PROMPT = `
### ROLE & PURPOSE
You are the official AI Support Assistant for Acme Store.
Provide fast, friendly support on Telegram, answer product questions, and route complex requests to human admins.

### KNOWLEDGE & CONTEXT
- Refund Policy: 30-day money-back guarantee on unused items.
- Shipping Info: Free shipping on orders over $50. Standard shipping takes 3-5 business days.
- Support Email: support@acmestore.com
- Order Tracking: https://acmestore.com/track

### GUIDELINES & BEHAVIOR
1. Respond naturally to general greetings (e.g., "hi", "hello", "how are you"). Do NOT trigger human handoff for simple greetings or general conversation.
2. Keep responses short and optimized for mobile screens.
3. Only answer policy or business questions using the facts provided above.

### HUMAN HANDOFF PROTOCOL
ONLY trigger human handoff if:
- The user explicitly asks for a human, agent, or support rep.
- The user expresses severe frustration or complaint.
- The user asks a specific order, payment, or policy question NOT covered in the knowledge base.

When handoff is necessary, append '[TRIGGER_HUMAN_HANDOFF]' at the very end of your response.
`;

function getSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      isHumanMode: false,
      history: [{ role: 'system', content: SYSTEM_PROMPT }]
    });
  }
  return userSessions.get(userId);
}

bot.command('start', async (ctx) => {
  const session = getSession(ctx.from.id);
  session.isHumanMode = false;
  
  await ctx.reply(
    `👋 Hello ${ctx.from.first_name}! I am the Acme Store AI Assistant.\n\nHow can I help you today? Ask me about products, shipping, or refunds!`,
    {
      reply_markup: new InlineKeyboard().text("🗣️ Talk to a Human Agent", "request_human")
    }
  );
});

bot.command('reset', async (ctx) => {
  const args = ctx.message.text.split(' ');
  const targetUserId = parseInt(args[1]);

  if (!targetUserId) {
    return ctx.reply("⚠️ Usage: /reset <USER_ID>");
  }

  const session = getSession(targetUserId);
  session.isHumanMode = false;
  
  await ctx.reply(`✅ Chat for User ID ${targetUserId} has been returned to AI Mode.`);
  await bot.api.sendMessage(targetUserId, "🤖 A human agent has closed the support ticket. I am back to assist you!");
});

bot.callbackQuery("request_human", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = getSession(ctx.from.id);
  session.isHumanMode = true;

  await ctx.reply("👨‍💼 I've flagged your request! A human support agent will reply directly in this chat shortly.");
  
  if (process.env.ADMIN_GROUP_ID) {
    await bot.api.sendMessage(
      process.env.ADMIN_GROUP_ID,
      `🚨 *HUMAN HANDOFF REQUESTED*\n\n` +
      `👤 *User:* ${ctx.from.first_name} (@${ctx.from.username || 'NoUsername'})\n` +
      `🆔 *User ID:* \`${ctx.from.id}\`\n\n` +
      `To take over, reply to their messages using Telegram's reply function, or type \`/reset ${ctx.from.id}\` to re-enable AI.`,
      { parse_mode: "Markdown" }
    );
  }
});

bot.on(':web_app_data', async (ctx) => {
  const rawData = ctx.message.web_app_data.data;
  
  try {
    const parsedData = JSON.parse(rawData);

    if (parsedData.type === 'CREATE_TICKET') {
      await ctx.reply(`✅ *Support Ticket Created!*\n\nIssue: "${parsedData.issue}"\n\nOur human admin team will review this shortly.`, { parse_mode: 'Markdown' });

      if (process.env.ADMIN_GROUP_ID) {
        await bot.api.sendMessage(
          process.env.ADMIN_GROUP_ID,
          `🎫 *NEW TICKET SUBMITTED VIA MINI APP*\n\n` +
          `👤 *User ID:* \`${ctx.from.id}\`\n` +
          `📝 *Details:* ${parsedData.issue}`,
          { parse_mode: 'Markdown' }
        );
      }
    }
  } catch (e) {
    console.error("Failed to parse Web App Data:", e);
  }
});

bot.on('message:text', async (ctx) => {
  const userId = ctx.from.id;
  const userMessage = ctx.message.text;

  // 1. Handle Admin Group interactions
  if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
    if (ctx.message.reply_to_message) {
      const replyText = ctx.message.reply_to_message.text || "";
      const match = replyText.match(/User ID:\s*(\d+)/) || replyText.match(/ID:\s*`(\d+)`/);

      if (match && match[1]) {
        const targetUserId = match[1];
        await bot.api.sendMessage(targetUserId, `👨‍💼 *Support Agent:* ${userMessage}`, { parse_mode: "Markdown" });
      }
    }
    return; // Ignore general group chatter
  }

  // 2. Private 1-on-1 User Conversations
  const session = getSession(userId);

  if (session.isHumanMode) {
    if (process.env.ADMIN_GROUP_ID) {
      await bot.api.sendMessage(
        process.env.ADMIN_GROUP_ID,
        `📩 *Message from User ID ${userId}* (@${ctx.from.username || 'NoUsername'}):\n\n${userMessage}`,
        { parse_mode: "Markdown" }
      );
    }
    return;
  }

  await ctx.replyWithChatAction('typing');

  if (session.history.length > 11) {
    session.history = [session.history[0], ...session.history.slice(-10)];
  }

  session.history.push({ role: 'user', content: userMessage });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: session.history,
      temperature: 0.3,
    });

    let aiReply = response.choices[0].message.content;

    if (aiReply.includes('[TRIGGER_HUMAN_HANDOFF]')) {
      aiReply = aiReply.replace('[TRIGGER_HUMAN_HANDOFF]', '').trim();
      session.isHumanMode = true;

      await ctx.reply(aiReply);

      if (process.env.ADMIN_GROUP_ID) {
        await bot.api.sendMessage(
          process.env.ADMIN_GROUP_ID,
          `⚠️ *AUTOMATIC HANDOFF TRIGGERED*\n\n` +
          `👤 *User:* ${ctx.from.first_name} (@${ctx.from.username || 'NoUsername'})\n` +
          `🆔 *User ID:* \`${userId}\`\n` +
          `💬 *Last Question:* "${userMessage}"`,
          { parse_mode: "Markdown" }
        );
      }
    } else {
      await ctx.reply(aiReply, { parse_mode: "Markdown" });
    }

    session.history.push({ role: 'assistant', content: aiReply });

  } catch (error) {
    console.error("OpenAI Error:", error);
    await ctx.reply("I'm having trouble processing your request right now. Please try again in a moment.");
  }
});

// Catch errors globally to keep bot running
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

bot.start();
console.log("🚀 Telegram AI Bot is running...");
