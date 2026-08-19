bot.on('message:text', async (ctx) => {
  const userId = ctx.from.id;
  const userMessage = ctx.message.text;

  // 1. IGNORE ALL GENERAL GROUP MESSAGES
  // If the message comes from a Group/Supergroup, handle admin replies and exit
  if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
    // Check if an admin is replying to a forwarded customer alert
    if (ctx.message.reply_to_message) {
      const replyText = ctx.message.reply_to_message.text || "";
      const match = replyText.match(/User ID:\s*(\d+)/) || replyText.match(/ID:\s*`(\d+)`/);

      if (match && match[1]) {
        const targetUserId = match[1];
        await bot.api.sendMessage(targetUserId, `👨‍💼 *Support Agent:* ${userMessage}`, { parse_mode: "Markdown" });
        return;
      }
    }
    return; // Stop processing - do NOT pass group chat messages to OpenAI
  }

  // 2. PRIVATE CHAT LOGIC (Customer Conversations)
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
