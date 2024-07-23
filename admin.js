const TelegramBot = require('node-telegram-bot-api');
const token = '6911216755:AAGlDbzA5WLa0bZlMk2iv3dx7T2vko55sXc';
const bot = new TelegramBot(token, { polling: true });

bot.start((ctx) => {
    const chatId = ctx.chat.id; // Get chat ID from the context
    ctx.reply('SHOP', {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: 'SHOP',
                        web_app: { url: `https://lk-rt5d.onrender.com/admin/index.html?userId=${chatId}` }
                    }
                ]
            ]
        }
    });
});

bot.launch();
