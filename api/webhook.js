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

const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const STEX_HEADERS = { 'mauthapi': STEX_API_KEY, 'Content-Type': 'application/json' };

const MIN_WITHDRAW = 0.5;
const DOLLAR_RATE = 150;

// ==========================================
// 🗄️ DATABASE HELPERS
// ==========================================
async function getUser(userId, username) {
    let { data } = await supabase.from('stex_users').select('*').eq('user_id', userId.toString()).single();
    if (!data) {
        data = { 
            user_id: userId.toString(), username: username || 'User', current_prefix: null, status: 'idle', 
            total_otps: 0, history: [], total_withdrawn: 0, bonus_balance: 0, temp_data: {}, 
            cooldown_until: null, spam_count: 0, last_msg_time: 0 
        };
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
    return 'Other Service';
}

// ==========================================
// 🛡️ ANTI-SPAM SYSTEM (DB-BASED FOR VERCEL)
// ==========================================
bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    if (ctx.from.id.toString() === ADMIN_ID) return next(); // অ্যাডমিনের জন্য স্প্যাম ফ্রি

    try {
        const user = await getUser(ctx.from.id, ctx.from.first_name);
        const now = Date.now();

        // ১. ইউজার কি ব্যান অবস্থায় আছে?
        if (user.cooldown_until) {
            const cooldownEnd = new Date(user.cooldown_until).getTime();
            if (now < cooldownEnd) {
                const left = Math.ceil((cooldownEnd - now) / 60000);
                // প্রতিবার চাপলে যেন মেসেজ দিয়ে বিরক্ত না করে, তাই ৫ সেকেন্ড পরপর মেসেজ দেবে
                if (now - (user.last_msg_time || 0) > 5000) {
                    await updateUser(ctx.from.id, { last_msg_time: now });
                    ctx.reply(`🚫 *SPAM DETECTED!*\nYou are temporarily blocked. Please try again after ${left} minutes.`, { parse_mode: 'Markdown' }).catch(()=>{});
                }
                return; // এখানেই কোড থেমে যাবে, ব্লক!
            } else {
                await updateUser(ctx.from.id, { cooldown_until: null, spam_count: 0 }); // ব্যান শেষ
            }
        }

        // ২. স্প্যাম কাউন্টার লজিক
        const timeDiff = now - (user.last_msg_time || 0);
        let newSpamCount = user.spam_count || 0;

        if (timeDiff < 2000) { // ২ সেকেন্ডের কম সময়ে পরপর ক্লিক করলে
            newSpamCount += 1;
            if (newSpamCount >= 4) { // ৫ বার স্প্যাম করলে
                const cooldownTime = new Date(now + 15 * 60000).toISOString();
                await updateUser(ctx.from.id, { cooldown_until: cooldownTime, spam_count: 0, last_msg_time: now });
                return ctx.reply('🚫 *ACCOUNT SUSPENDED (15 MIN)*\n\nYou have been temporarily muted for spamming the bot buttons rapidly.', { parse_mode: 'Markdown' }).catch(()=>{});
            } else {
                await updateUser(ctx.from.id, { spam_count: newSpamCount, last_msg_time: now });
            }
        } else {
            // নরমাল স্পিডে ক্লিক করলে কাউন্টার আবার জিরো হয়ে যাবে
            await updateUser(ctx.from.id, { spam_count: 0, last_msg_time: now });
        }
    } catch (e) {
        console.log("Anti-spam error");
    }
    
    return next();
});

// ==========================================
// 🔄 AUTO CHANNEL SYNC FUNCTION
// ==========================================
async function syncGlobalOTPs() {
    try {
        const res = await fetch(`${STEX_BASE_URL}/success-otp`, { headers: STEX_HEADERS });
        const json = await res.json();
        if (json.meta && json.meta.code === 200 && json.data && json.data.otps) {
            for (let otp of json.data.otps.reverse()) { 
                let { data } = await supabase.from('stex_posted_otps').select('otp_id').eq('otp_id', otp.otp_id).single();
                if (!data) {
                    const codeMatch = otp.message.match(/\d{4,8}/);
                    const pureCode = codeMatch ? codeMatch[0] : otp.message;
                    const maskedNum = otp.number.substring(0, 4) + '***' + otp.number.substring(otp.number.length - 4);
                    
                    const channelMsg = `🔥 *NEW SUCCESSFUL OTP* 🔥\n\n📱 Service: ${guessService(otp.message)}\n📞 Number: \`+${maskedNum}\`\n💬 Code: \`${pureCode}\`\n\n📥 SMS: _${otp.message}_`;
                    await bot.telegram.sendMessage(CHANNEL_ID, channelMsg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[Markup.button.url('🤖 Get This Number', `https://t.me/${BOT_USERNAME}`)]] } }).catch(()=> {});
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

bot.command('start', async (ctx) => {
    try {
        await getUser(ctx.from.id, ctx.from.first_name);
        ctx.reply(`🌟 *Welcome to Siyam X OTP 🚀!* 🌟\n\n⚡ Get number and code faster.\n👇 Select an option from the menu below:`, { parse_mode: 'Markdown', ...mainMenu });
    } catch (e) {}
});

// ==========================================
// 💳 BALANCE & WITHDRAW SYSTEM
// ==========================================
bot.hears('💳 My Balance', async (ctx) => {
    try {
        const user = await getUser(ctx.from.id);
        const otpEarned = user.total_otps * 0.004;
        const bonus = user.bonus_balance || 0;
        const withdrawn = user.total_withdrawn || 0;
        
        const totalEarned = otpEarned + bonus;
        const available = totalEarned - withdrawn;
        
        const msg = `💳 *YOUR WALLET*\n━━━━━━━━━━━━━━━\n👤 *User:* ${user.username}\n\n✅ *OTP Earnings:* $${otpEarned.toFixed(3)}\n🎁 *Bonus Balance:* $${bonus.toFixed(3)}\n\n📥 *Total Earned:* $${totalEarned.toFixed(3)}\n📤 *Total Withdrawn:* $${withdrawn.toFixed(3)}\n💵 *Available Balance:* $${available.toFixed(3)}\n\n_⚠️ Minimum withdrawal is $${MIN_WITHDRAW}_`;
        
        const buttons = Markup.inlineKeyboard([[Markup.button.callback('💸 Withdraw Funds', 'req_withdraw')]]);
        ctx.reply(msg, { parse_mode: 'Markdown', ...buttons });
    } catch (e) {}
});

bot.action('req_withdraw', async (ctx) => {
    const user = await getUser(ctx.from.id);
    const available = (user.total_otps * 0.004) + (user.bonus_balance || 0) - (user.total_withdrawn || 0);

    if (available < MIN_WITHDRAW) return ctx.answerCbQuery(`❌ Not enough balance! Min: $${MIN_WITHDRAW}`, { show_alert: true });

    const msg = `🏦 *Select Payment Method*\n\nAvailable Balance: $${available.toFixed(3)}`;
    const buttons = Markup.inlineKeyboard([
        [Markup.button.callback('🟣 bKash', 'wd_bkash'), Markup.button.callback('🟠 Nagad', 'wd_nagad')],
        [Markup.button.callback('❌ Cancel', 'close_msg')]
    ]);
    await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...buttons }).catch(()=>{});
});

bot.action(/wd_(bkash|nagad)/, async (ctx) => {
    const method = ctx.match[1] === 'bkash' ? 'bKash' : 'Nagad';
    await updateUser(ctx.from.id, { status: `waiting_wd_num`, temp_data: { wd_method: method } });
    await ctx.editMessageText(`🏦 *${method} Withdrawal*\n\nPlease send your ${method} Account Number.\n_(e.g. 017... or +8801...)_`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel_wd')]]) }).catch(()=>{});
});

// ==========================================
// 🔥 TRENDING TRAFFIC & SMS STATUS
// ==========================================
bot.hears('🔥 Trending Traffic', async (ctx) => {
    const waitMsg = await ctx.reply('⏳ Analyzing global market traffic...');
    try {
        const res = await fetch(`${STEX_BASE_URL}/console`, { headers: STEX_HEADERS });
        const json = await res.json();
        
        if (json.meta && json.meta.code === 200 && json.data.hits) {
            const hits = json.data.hits;
            const rangeCounts = {};
            hits.forEach(h => { rangeCounts[h.range] = (rangeCounts[h.range] || 0) + 1; });
            const topRanges = Object.keys(rangeCounts).map(k => ({ range: k, count: rangeCounts[k] })).sort((a, b) => b.count - a.count).slice(0, 5);

            let text = `🔥 *LIVE TRENDING PREFIXES*\n━━━━━━━━━━━━━━━\n_Based on global success rate in last 15m_\n\n`;
            topRanges.forEach((t, i) => { text += `${i + 1}. 🔥 \`${t.range}\` ➾ *${t.count} Hits*\n`; });

            const buttons = Markup.inlineKeyboard([[Markup.button.callback('💬 SMS Status', 'show_sms_status')], [Markup.button.callback('❌ Close', 'close_msg')]]);
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, text, { parse_mode: 'Markdown', ...buttons });
        }
    } catch (e) { await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, '❌ Failed to connect.'); }
});

bot.action('show_sms_status', async (ctx) => {
    try {
        const res = await fetch(`${STEX_BASE_URL}/console`, { headers: STEX_HEADERS });
        const json = await res.json();
        if (json.meta && json.meta.code === 200 && json.data.hits && json.data.hits.length > 0) {
            let text = `📊 *LIVE GLOBAL SMS (Last 15m)*\n━━━━━━━━━━━━━━━━━━━━\n`;
            json.data.hits.slice(0, 6).forEach(hit => { text += `📲 *${hit.sid}* | Range: \`${hit.range}\`\n💬 _${hit.message.substring(0, 35)}..._\n\n`; });
            await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Close', 'close_msg')]]) }).catch(()=>{});
        } else { ctx.answerCbQuery('📭 No recent SMS found!', { show_alert: true }); }
    } catch (e) { ctx.answerCbQuery('❌ Error connecting.'); }
});

bot.action('close_msg', async (ctx) => { ctx.deleteMessage().catch(()=>{}); });

// ==========================================
// 💬 TEXT INPUT HANDLER
// ==========================================
bot.on('text', async (ctx, next) => {
    try {
        if (ctx.message.text.startsWith('/')) return next(); 

        const user = await getUser(ctx.from.id);
        const text = ctx.message.text.trim();

        if (user.status === 'waiting_prefix') {
            const prefix = text.replace(/[^0-9]/g, ''); 
            if (prefix.length < 3) return ctx.reply('❌ Invalid prefix! Try again.');
            await updateUser(ctx.from.id, { current_prefix: prefix, status: 'idle' });
            ctx.deleteMessage().catch(()=>{});
            sendNumberMenu(ctx, prefix);
        } 
        else if (user.status === 'waiting_wd_num') {
            const bdPhoneRegex = /^(?:\+880|0)[1][3-9]\d{8}$/;
            if (!bdPhoneRegex.test(text)) return ctx.reply('❌ Invalid Bangladeshi Number!').then(m => setTimeout(()=> ctx.telegram.deleteMessage(ctx.chat.id, m.message_id).catch(()=> {}), 3000));
            
            ctx.deleteMessage().catch(()=>{}); 
            let temp = user.temp_data || {};
            temp.wd_number = text;
            
            const available = (user.total_otps * 0.004) + (user.bonus_balance || 0) - (user.total_withdrawn || 0);
            await updateUser(ctx.from.id, { status: 'waiting_wd_amount', temp_data: temp });
            
            ctx.reply(`🏦 *Method:* ${temp.wd_method}\n📞 *Number:* \`${text}\`\n💵 *Available:* $${available.toFixed(3)}\n\n*Enter amount to withdraw (Min $0.5):*`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel_wd')]]) });
        }
        else if (user.status === 'waiting_wd_amount') {
            const amount = parseFloat(text);
            const available = (user.total_otps * 0.004) + (user.bonus_balance || 0) - (user.total_withdrawn || 0);
            ctx.deleteMessage().catch(()=>{}); 

            if (isNaN(amount) || amount < MIN_WITHDRAW || amount > available) {
                return ctx.reply(`❌ Invalid amount! Please enter between $${MIN_WITHDRAW} and $${available.toFixed(3)}`).then(m => setTimeout(()=> ctx.telegram.deleteMessage(ctx.chat.id, m.message_id).catch(()=> {}), 3000));
            }

            let temp = user.temp_data;
            temp.wd_amount = amount;
            const bdtAmount = Math.floor(amount * DOLLAR_RATE);
            
            await updateUser(ctx.from.id, { status: 'idle', temp_data: temp });

            const confirmMsg = `🛑 *WITHDRAWAL CONFIRMATION* 🛑\n━━━━━━━━━━━━━━━━━━\n\n🏦 *Payment Method:* ${temp.wd_method}\n📞 *Account Number:* \`${temp.wd_number}\`\n💵 *Requested Amount:* $${amount.toFixed(3)}\n\n💰 *You Will Receive:* ${bdtAmount} BDT\n\n_Click Confirm to send request to Admin._`;
            const buttons = Markup.inlineKeyboard([[Markup.button.callback('✅ Confirm & Withdraw', 'confirm_wd')], [Markup.button.callback('❌ Cancel', 'cancel_wd')]]);
            ctx.reply(confirmMsg, { parse_mode: 'Markdown', ...buttons });
        }
        else { return next(); }
    } catch (e) { return next(); }
});

bot.action('cancel_wd', async (ctx) => {
    await updateUser(ctx.from.id, { status: 'idle', temp_data: {} });
    await ctx.editMessageText('❌ Withdrawal Process Cancelled.', { parse_mode: 'Markdown' }).catch(()=>{});
    setTimeout(() => ctx.deleteMessage().catch(()=>{}), 2000);
});

bot.action('confirm_wd', async (ctx) => {
    try {
        const user = await getUser(ctx.from.id);
        const temp = user.temp_data;
        if (!temp.wd_amount) return ctx.answerCbQuery('Session expired. Try again.', { show_alert: true });

        const newWithdrawn = (user.total_withdrawn || 0) + temp.wd_amount;
        await updateUser(ctx.from.id, { total_withdrawn: newWithdrawn, temp_data: {} });

        await ctx.editMessageText(`✅ *Withdrawal Request Sent!*\n\nYour request for $${temp.wd_amount.toFixed(3)} has been sent to the Admin. Please wait for approval.`, { parse_mode: 'Markdown' }).catch(()=>{});

        const bdtAmount = Math.floor(temp.wd_amount * DOLLAR_RATE);
        const adminMsg = `🚨 *NEW WITHDRAWAL REQUEST* 🚨\n━━━━━━━━━━━━━━━━━━\n👤 *User:* ${user.username}\n🆔 *ID:* \`${user.user_id}\`\n\n🏦 *Method:* ${temp.wd_method}\n📞 *Number:* \`${temp.wd_number}\`\n💵 *Amount:* $${temp.wd_amount.toFixed(3)}  ( *${bdtAmount} BDT* )`;
        const adminButtons = Markup.inlineKeyboard([[Markup.button.callback('✅ Approve Payment', `appr_${user.user_id}_${temp.wd_amount}`)], [Markup.button.callback('❌ Reject & Refund', `reje_${user.user_id}_${temp.wd_amount}`)]]);
        await bot.telegram.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'Markdown', ...adminButtons }).catch(()=>{});
    } catch (e) { ctx.answerCbQuery('❌ Error processing request.'); }
});

// ==========================================
// 👑 SECURE ADMIN COMMANDS & WITHDRAW ACTIONS
// ==========================================
bot.command('stats', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const { count } = await supabase.from('stex_users').select('*', { count: 'exact', head: true });
    const { data } = await supabase.from('stex_users').select('total_otps');
    const totalOtps = data ? data.reduce((sum, u) => sum + u.total_otps, 0) : 0;
    ctx.reply(`👑 *ADMIN DASHBOARD*\n━━━━━━━━━━━━━━━\n👥 Total Users: ${count}\n✅ Total Global OTPs: ${totalOtps}`, { parse_mode: 'Markdown' });
});

bot.command('userinfo', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const targetId = ctx.message.text.split(' ')[1];
    if (!targetId) return ctx.reply('⚠️ Use format: `/userinfo UserID`', { parse_mode: 'Markdown' });
    let { data } = await supabase.from('stex_users').select('*').eq('user_id', targetId).single();
    if (!data) return ctx.reply('❌ User not found.');
    ctx.reply(`👤 *User Info*\nName: ${data.username}\nPrefix: ${data.current_prefix}XXX\nOTPs: ${data.total_otps}\nBonus: $${data.bonus_balance || 0}\nWithdrawn: $${data.total_withdrawn || 0}`, { parse_mode: 'Markdown' });
});

bot.command('broadcast', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const msg = ctx.message.text.replace('/broadcast ', '');
    if (!msg || msg === '/broadcast') return ctx.reply('⚠️ Format: `/broadcast Your Message`', { parse_mode: 'Markdown' });
    const { data } = await supabase.from('stex_users').select('user_id');
    let sent = 0;
    for (let user of data) {
        try { await bot.telegram.sendMessage(user.user_id, `📢 *Admin Update:*\n\n${msg}`, { parse_mode: 'Markdown' }); sent++; } catch (e) {}
    }
    ctx.reply(`✅ Broadcast sent to ${sent} users.`);
});

bot.command('addbalance', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    
    if (args.length !== 3) return ctx.reply('⚠️ *Use format:* `/addbalance UserID Amount`\n\n*Example:* `/addbalance 12345678 1.5`\n_(To deduct balance, use minus. Example: -1.5)_', { parse_mode: 'Markdown' });

    const targetId = args[1];
    const amount = parseFloat(args[2]);
    if (isNaN(amount)) return ctx.reply('❌ Invalid amount!');

    let { data: user } = await supabase.from('stex_users').select('*').eq('user_id', targetId).single();
    if (!user) return ctx.reply('❌ User not found in database.');

    const newBonus = (user.bonus_balance || 0) + amount;
    await updateUser(targetId, { bonus_balance: newBonus });

    ctx.reply(`✅ Successfully updated balance for \`${targetId}\`\n💰 *New Bonus Balance:* $${newBonus.toFixed(3)}`, { parse_mode: 'Markdown' });
    if (amount > 0) bot.telegram.sendMessage(targetId, `🎁 *BONUS RECEIVED!*\n\nAdmin has added $${amount.toFixed(3)} to your wallet!`, { parse_mode: 'Markdown' }).catch(()=>{});
});

bot.action(/^appr_(.+)_(.+)$/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const targetUserId = ctx.match[1];
    const amount = ctx.match[2];

    await ctx.editMessageText(ctx.callbackQuery.message.text + `\n\n✅ *STATUS: APPROVED & PAID*`, { parse_mode: 'Markdown' }).catch(()=>{});
    await bot.telegram.sendMessage(targetUserId, `🎉 *PAYMENT SUCCESSFUL!* 🎉\n\nYour withdrawal request of $${amount} has been approved and successfully sent to your account.`, { parse_mode: 'Markdown' }).catch(()=>{});
});

bot.action(/^reje_(.+)_(.+)$/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const targetUserId = ctx.match[1];
    const refundAmount = parseFloat(ctx.match[2]);

    const user = await getUser(targetUserId);
    const updatedWithdrawn = (user.total_withdrawn || 0) - refundAmount;
    await updateUser(targetUserId, { total_withdrawn: updatedWithdrawn });

    await ctx.editMessageText(ctx.callbackQuery.message.text + `\n\n❌ *STATUS: REJECTED & REFUNDED*`, { parse_mode: 'Markdown' }).catch(()=>{});
    await bot.telegram.sendMessage(targetUserId, `⚠️ *PAYMENT REJECTED* ⚠️\n\nYour withdrawal request of $${refundAmount} was rejected by the admin. The amount has been refunded back to your bot balance.`, { parse_mode: 'Markdown' }).catch(()=>{});
});

// ==========================================
// 👤 PROFILE & GET NUMBER LOGIC
// ==========================================
bot.hears('👤 My Profile', async (ctx) => { 
    try {
        const user = await getUser(ctx.from.id);
        const date = new Date(user.join_date).toLocaleDateString('en-GB');
        const msg = `🪪 *DIGITAL ID CARD*\n━━━━━━━━━━━━━━━\n👤 *Name:* ${user.username}\n🆔 *ID:* \`${user.user_id}\`\n📅 *Joined:* ${date}\n\n🎯 *Active Prefix:* \`${user.current_prefix ? user.current_prefix + 'XXX' : 'Not Set'}\`\n✅ *Total OTPs Taken:* ${user.total_otps}`;
        ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (e) {}
});

bot.hears('📜 Recent History', async (ctx) => {
    try {
        const user = await getUser(ctx.from.id);
        const history = user.history || [];
        if (history.length === 0) return ctx.reply('📭 You have no successful OTP history yet.');
        let msg = `📜 *Your Last 5 OTPs*\n━━━━━━━━━━━━━━━\n`;
        history.reverse().forEach(h => { msg += `📞 \`+${h.num}\`\n💬 Code: \`${h.code}\`\n\n`; });
        ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (e) {}
});

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

function sendNumberMenu(ctx, prefix) {
    const text = `📱 *NUMBER GENERATOR*\n━━━━━━━━━━━━━━━\n🎯 *Current Range:* \`${prefix}XXX\`\n\nClick below to get a number:`;
    const buttons = Markup.inlineKeyboard([[Markup.button.callback('📲 Get Number Now', 'get_new_number')], [Markup.button.callback('⚙️ Set Another Prefix', 'set_prefix')]]);
    if (ctx.updateType === 'callback_query') { ctx.editMessageText(text, { parse_mode: 'Markdown', ...buttons }).catch(()=>{}); } 
    else { ctx.reply(text, { parse_mode: 'Markdown', ...buttons }); }
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
            const buttons = Markup.inlineKeyboard([[Markup.button.callback('🔄 Check OTP', `chk_${num}`)], [Markup.button.callback('🔁 Change number', 'get_new_number')], [Markup.button.callback('🔙 Menu', 'close_msg')]]);
            await ctx.editMessageText(text, { parse_mode: 'Markdown', ...buttons }).catch(()=>{});
        } else {
            await ctx.editMessageText(`❌ *Stock Unavailable*\nNo numbers left in ${user.current_prefix}XXX.`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⚙️ Set Another Prefix', 'set_prefix')]]) }).catch(()=>{});
        }
    } catch (e) { await ctx.editMessageText('❌ API Error!').catch(()=>{}); }
});

bot.action(/chk_(.+)/, async (ctx) => {
    const targetNumber = ctx.match[1];
    try {
        const res = await fetch(`${STEX_BASE_URL}/success-otp`, { headers: STEX_HEADERS });
        const json = await res.json();
        
        if (json.meta && json.meta.code === 200 && json.data && json.data.otps) {
            const foundOtp = json.data.otps.find(otp => otp.number === targetNumber);
            if (foundOtp) {
                const pureCode = foundOtp.message.match(/\d{4,8}/) ? foundOtp.message.match(/\d{4,8}/)[0] : foundOtp.message;
                const srv = guessService(foundOtp.message);

                await ctx.editMessageText(`✅ *OTP Received!*\nCheck the new message below 👇`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 Get Another', 'get_new_number')], [Markup.button.callback('❌ Close', 'close_msg')]]) }).catch(()=>{});
                await ctx.reply(`📱 *Service:* ${srv}\n📞 *Number:* \`${foundOtp.number}\`\n💬 *Code:* \`${pureCode}\``, { parse_mode: 'Markdown' });

                const user = await getUser(ctx.from.id);
                const newHistory = user.history || [];
                newHistory.push({ num: foundOtp.number, code: pureCode });
                const cappedHistory = newHistory.slice(-5); 
                
                await updateUser(ctx.from.id, { total_otps: user.total_otps + 1, history: cappedHistory });

                return ctx.answerCbQuery('✅ OTP Found!');
            }
        }
        ctx.answerCbQuery('⏳ Still waiting for OTP...', { show_alert: true });
    } catch (e) { ctx.answerCbQuery('❌ Error connecting.'); }
});

// ==========================================
// 🔥 VERCEL SERVERLESS HANDLER
// ==========================================
module.exports = async function handler(req, res) {
    if (req.method === 'GET' && req.query.sync === 'true') {
        await syncGlobalOTPs(); 
        return res.status(200).send('✅ OTPs Synced');
    }

    if (req.method === 'POST') {
        try { 
            syncGlobalOTPs().catch(()=>{});
            await bot.handleUpdate(req.body); 
            res.status(200).send('OK'); 
        } catch (error) { res.status(500).send('Error'); }
    } else { res.status(200).send('✅ Premium OTP Bot is Running perfectly!'); }
};
