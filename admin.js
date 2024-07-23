const TelegramBot = require('node-telegram-bot-api');
const token = '6911216755:AAGlDbzA5WLa0bZlMk2iv3dx7T2vko55sXc';
const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id; // Corrected variable name
  bot.sendMessage(chatId, 'SHOP', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'SHOP',
            web_app: { url: 'https://site-45i5.onrender.com/admin/index.html' }
          }
        ]
      ]
    }
  });
});
