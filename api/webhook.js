let initError = null;
let bot;

try {
    const { Telegraf, Markup } = require('telegraf');
    const { createClient } = require('@supabase/supabase-js');

    // ==========================================
    // 🔑 API KEYS & CONFIGURATIONS
    // ==========================================
    const BOT_TOKEN = '8571540558:AAHv9KuMbl-Ct-yWZNJKXUxBCqdNHKSBPlA';
    const BOT_USERNAME = 'SiyamXotp_Robot'; 
    
    const ADMIN_ID = '5968392734';
    const CHANNEL_ID = '@siyamXotp';

    const SUPABASE_URL = 'https://ocrhnssxamusvlnkvzwn.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_3pT3XXRD3kvRq2b5vZZjeA_JRsTQhOg';

    const STEX_API_KEY = 'M704VEUDSZ3';
    const STEX_BASE_URL = 'https://api.2oo9.cloud/MXS47FLFX0U/tness/@public/api';

    bot = new Telegraf(BOT_TOKEN);
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const STEX_HEADERS = { 'mauthapi': STEX_API_KEY, 'Content-Type': 'application/json' };

    // ==========================================
    // 🗄️ DATABASE HELPERS
    // ==========================================
    async function getUser(userId, username) {
        let { data } = await supabase.from('stex_users').select('*').eq('user_id', userId.toString()).single();
        if (!data) {
            data = { user_id: userId.toString(), username: username || 'User', current_prefix: null, status: 'idle', total_otps: 0, history: [] };
            await supabase.from('stex_users').insert([data]);
        }
        return data;
    }

    async function updateUser(userId, updates) {
        await supabase.from('stex_users').update(updates).eq('user_id', userId.toString());
    }

    function getRank(total) {
        if (total < 10) return '🥉 Newbie';
        if (total < 50) return '🥈 Advanced';
        if (total < 100) return '🥇 Pro Worker';
        return '👑 Master';
    }

    function guessService(msg) {
        let m = msg.toLowerCase();
        if(m.includes('facebook') || m.includes('fb')) return 'Facebook';
        if(m.includes('instagram') || m.includes('ig')) return 'Instagram';
        if(m.includes('whatsapp')) return 'WhatsApp';
        if(m.includes('google')) return 'Google';
        if(m.includes('telegram')) return 'Telegram';
        if(m.includes('tiktok')) return 'TikTok';
        return 'Any Service';
    }

    // ==========================================
    // 🔄 AUTO CHANNEL SYNC FUNCTION
    // ==========================================
    async function syncGlobalOTPs() {
        try {
            const res = await fetch(`${STEX_BASE_URL}/success-otp`, { headers: STEX_HEADERS });
            const json = await res.json();
            
            if (json.meta && json.meta.code === 200 && json.data && json.data.otps) {
                // প্যানেলের সব ওটিপি চেক করা
                for (let otp of json.data.otps.reverse()) { 
                    // চেক করা যে এই ওটিপি আগে চ্যানেলে গেছে কি না
                    let { data } = await supabase.from('stex_posted_otps').select('otp_id').eq('otp_id', otp.otp_id).single();
                    if (!data) {
                        const codeMatch = otp.message.match(/\d{4,8}/);
                        const pureCode = codeMatch ? codeMatch[0] : otp.message;
                        const srv = guessService(otp.message);
                        const maskedNum = otp.number.substring(0, 4) + '***' + otp.number.substring(otp.number.length - 4);
                        
                        const channelMsg = `🔥 *NEW SUCCESSFUL OTP* 🔥\n\n`
                                         + `📱 Service: ${srv}\n`
                                         + `📞 Number: \`+${maskedNum}\`\n`
                                         + `💬 Code: \`${pureCode}\`\n\n`
                                         + `📥 SMS: _${otp.message}_`;

                        await bot.telegram.sendMessage(CHANNEL_ID, channelMsg, {
                            parse_mode: 'Markdown',
                            reply_markup: { inline_keyboard: [[Markup.button.url('🤖 Get This Number', `https://t.me/${BOT_USERNAME}`)]] }
                        }).catch(()=> {});

                        // ডাটাবেসে সেভ করা যাতে দ্বিতীয়বার না যায়
                        await supabase.from('stex_posted_otps').insert([{ otp_id: otp.otp_id }]);
                    }
                }
            }
        } catch(e) {}
    }

    // ==========================================
    // 📱 BOTTOM KEYBOARD
    // ==========================================
    const mainMenu = Markup.keyboard([
        ['📱 Get Number', '🔥 Trending Traffic'],
        ['👤 My Profile', '💳 My Balance'],
        ['📜 Recent History']
    ]).resize();

    // ==========================================
    // 🚀 CORE COMMANDS & MENU
    // ==========================================
    bot.command('start', async (ctx) => {
        try {
            await getUser(ctx.from.id, ctx.from.first_name);
            const msg = `🌟 *Welcome to Premium OTP Bot!* 🌟\n\n`
                      + `⚡ Superfast & Reliable OTP Bypass Service.\n`
                      + `👇 Select an option from the menu below:`;
            ctx.reply(msg, { parse_mode: 'Markdown', ...mainMenu });
        } catch (e) {}
    });

    bot.hears('💳 My Balance', async (ctx) => {
        try {
            const user = await getUser(ctx.from.id);
            const totalEarned = (user.total_otps * 0.004).toFixed(3);
            
            const msg = `💳 *YOUR WALLET*\n━━━━━━━━━━━━━━━\n`
                      + `👤 *User:* ${user.username}\n\n`
                      + `✅ *Unpaid OTPs:* ${user.total_otps}\n`
                      + `💰 *Total Earnings:* $${totalEarned}\n`
                      + `💵 *Unpaid Balance:* $${totalEarned}\n\n`
                      + `_⏳ Withdrawal system is coming soon..._`;
            
            ctx.reply(msg, { parse_mode: 'Markdown' });
        } catch (e) {}
    });

    // ... (Profile, History, Traffic remain same, skipping repetition for cleanliness) ...
    bot.hears('👤 My Profile', async (ctx) => {
        try {
            const user = await getUser(ctx.from.id);
            const rank = getRank(user.total_otps);
            const date = new Date(user.join_date).toLocaleDateString('en-GB');
            const msg = `🪪 *DIGITAL ID CARD*\n━━━━━━━━━━━━━━━\n👤 *Name:* ${user.username}\n🆔 *ID:* \`${user.user_id}\`\n🏆 *Rank:* ${rank}\n📅 *Joined:* ${date}\n\n🎯 *Active Prefix:* \`${user.current_prefix ? user.current_prefix + 'XXX' : 'Not Set'}\`\n✅ *Total OTPs Taken:* ${user.total_otps}`;
            ctx.reply(msg, { parse_mode: 'Markdown' });
        } catch (e) {}
    });

    bot.hears('📜 Recent History', async (ctx) => {
        try {
            const user = await getUser(ctx.from.id);
            const history = user.history || [];
            if (history.length === 0) return ctx.reply('📭 You have no successful OTP history yet.');
            let msg = `📜 *Your Last 5 OTPs*\n━━━━━━━━━━━━━━━\n`;
            history.slice(-5).reverse().forEach(h => { msg += `📞 \`+${h.num}\`\n💬 Code: \`${h.code}\`\n\n`; });
            ctx.reply(msg, { parse_mode: 'Markdown' });
        } catch (e) {}
    });

    // ==========================================
    // 📱 GET NUMBER & OTP LOGIC
    // ==========================================
    bot.hears('📱 Get Number', async (ctx) => {
        const user = await getUser(ctx.from.id);
        if (!user.current_prefix) {
            await updateUser(ctx.from.id, { status: 'waiting_prefix' });
            return ctx.reply('⚙️ *No Prefix Set!*\n\nPlease send the prefix range you want to use.\n*(Example: 236723)*', { parse_mode: 'Markdown' });
        }
        sendNumberMenu(ctx, user.current_prefix);
    });

    bot.action('set_prefix', async (ctx) => {
        await updateUser(ctx.from.id, { status: 'waiting_prefix' });
        await ctx.editMessageText('⚙️ *Enter New Prefix Range*\n\nSend the numbers (e.g. 236723) in the chat:', { parse_mode: 'Markdown' }).catch(()=>{});
    });

    bot.on('text', async (ctx, next) => {
        try {
            const user = await getUser(ctx.from.id);
            if (user.status === 'waiting_prefix') {
                const prefix = ctx.message.text.replace(/[^0-9]/g, ''); 
                if (prefix.length < 3) return ctx.reply('❌ Invalid prefix! Try again.');
                await updateUser(ctx.from.id, { current_prefix: prefix, status: 'idle' });
                ctx.deleteMessage().catch(()=>{});
                sendNumberMenu(ctx, prefix);
            } else { return next(); }
        } catch (e) { return next(); }
    });

    function sendNumberMenu(ctx, prefix) {
        const text = `📱 *NUMBER GENERATOR*\n━━━━━━━━━━━━━━━\n🎯 *Current Range:* \`${prefix}XXX\`\n\nClick below to get a number:`;
        const buttons = Markup.inlineKeyboard([
            [Markup.button.callback('📲 Get Number Now', 'get_new_number')],
            [Markup.button.callback('⚙️ Set Another Prefix', 'set_prefix')]
        ]);
        if (ctx.updateType === 'callback_query') {
            ctx.editMessageText(text, { parse_mode: 'Markdown', ...buttons }).catch(()=>{});
        } else { ctx.reply(text, { parse_mode: 'Markdown', ...buttons }); }
    }

    bot.action('get_new_number', async (ctx) => {
        try {
            const user = await getUser(ctx.from.id);
            await ctx.editMessageText('⏳ Allocating a number for you...', { parse_mode: 'Markdown' }).catch(()=>{});

            const res = await fetch(`${STEX_BASE_URL}/getnum`, { method: 'POST', headers: STEX_HEADERS, body: JSON.stringify({ rid: user.current_prefix }) });
            const json = await res.json();

            if (json.meta && json.meta.code === 200 && json.data && json.data.no_plus_number) {
                const num = json.data.no_plus_number;
                const text = `✅ *Number Allocated!*\n━━━━━━━━━━━━━━━\n📞 *Number:* \`${num}\`\n🎯 *Range:* \`${user.current_prefix}XXX\`\n\n_Waiting for SMS... Click the Check OTP button below._`;
                const buttons = Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Check OTP', `chk_${num}`)],
                    [Markup.button.callback('🚫 Cancel / Change Number', 'get_new_number')],
                    [Markup.button.callback('🔙 Back to Menu', 'back_menu')]
                ]);
                await ctx.editMessageText(text, { parse_mode: 'Markdown', ...buttons }).catch(()=>{});
            } else {
                await ctx.editMessageText(`❌ *Stock Unavailable*\nNo numbers left in ${user.current_prefix}XXX right now.`, {
                    parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⚙️ Set Another Prefix', 'set_prefix')]])
                }).catch(()=>{});
            }
        } catch (e) { await ctx.editMessageText('❌ API Error! Try again later.').catch(()=>{}); }
    });

    // ==========================================
    // 🔄 CHECK OTP (SEPARATE MESSAGE)
    // ==========================================
    bot.action(/chk_(.+)/, async (ctx) => {
        const targetNumber = ctx.match[1];
        try {
            const res = await fetch(`${STEX_BASE_URL}/success-otp`, { headers: STEX_HEADERS });
            const json = await res.json();
            
            if (json.meta && json.meta.code === 200 && json.data && json.data.otps) {
                const foundOtp = json.data.otps.find(otp => otp.number === targetNumber);
                if (foundOtp) {
                    
                    const codeMatch = foundOtp.message.match(/\d{4,8}/);
                    const pureCode = codeMatch ? codeMatch[0] : foundOtp.message;
                    const srv = guessService(foundOtp.message);

                    // ১. পুরোনো মেসেজটি এডিট করে দেওয়া
                    const updateText = `✅ *OTP Received Successfully!*\nCheck the new message below 👇`;
                    const buttons = Markup.inlineKeyboard([
                        [Markup.button.callback('🔄 Get Another Number', 'get_new_number')],
                        [Markup.button.callback('🔙 Back to Menu', 'back_menu')]
                    ]);
                    await ctx.editMessageText(updateText, { parse_mode: 'Markdown', ...buttons }).catch(()=>{});

                    // ২. নতুন মেসেজে সার্ভিস, নাম্বার ও কোড দেওয়া (সহজে কপি করার জন্য)
                    const separateMsg = `📱 *Service:* ${srv}\n📞 *Number:* \`${foundOtp.number}\`\n💬 *Code:* \`${pureCode}\``;
                    await ctx.reply(separateMsg, { parse_mode: 'Markdown' });

                    // ৩. ডাটাবেসে হিস্ট্রি সেভ করা
                    const user = await getUser(ctx.from.id);
                    const newHistory = user.history || [];
                    newHistory.push({ num: foundOtp.number, code: pureCode });
                    await updateUser(ctx.from.id, { total_otps: user.total_otps + 1, history: newHistory });

                    return ctx.answerCbQuery('✅ OTP Found!');
                }
            }
            ctx.answerCbQuery('⏳ Still waiting for OTP... Please tap Check again.', { show_alert: true });
        } catch (e) { ctx.answerCbQuery('❌ Error connecting to server.'); }
    });

    bot.action('back_menu', async (ctx) => {
        try {
            const user = await getUser(ctx.from.id);
            sendNumberMenu(ctx, user.current_prefix);
        } catch (e) {}
    });

} catch (err) { initError = err.toString(); }

// ==========================================
// 🔥 VERCEL HANDLER & CRON JOB ENDPOINT
// ==========================================
module.exports = async function handler(req, res) {
    if (initError) return res.status(200).send(`🚨 Error: ${initError}`);
    
    // ক্রন জব বা ট্রিগারের জন্য স্পেশাল রুট
    if (req.method === 'GET' && req.query.sync === 'true') {
        await bot.syncGlobalOTPs(); 
        return res.status(200).send('✅ OTPs Synced to Channel');
    }

    if (req.method === 'POST') {
        try { 
            // কেউ কোনো মেসেজ দিলে বা বাটন চাপলে ব্যাকগ্রাউন্ডে চ্যানেল সিঙ্ক হবে
            bot.syncGlobalOTPs().catch(()=>{}); 
            
            await bot.handleUpdate(req.body); 
            res.status(200).send('OK'); 
        } catch (error) { res.status(500).send('Error'); }
    } else { res.status(200).send('✅ Premium OTP Bot is Running!'); }
};

// Functions access scope fix
if(bot) bot.syncGlobalOTPs = syncGlobalOTPs;
