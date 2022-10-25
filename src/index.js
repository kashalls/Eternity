require('dotenv').config()
const mineflayer = require('mineflayer')
const fetch = require('node-fetch')
const { MongoClient } = require('mongodb')

const client = new MongoClient(process.env.MONGODB_URI)
const db = client.db('eternal-realms')
const uuids = db.collection('uuids')
const users = db.collection('users')

const bot = mineflayer.createBot({
    host: process.env.HOST,
    port: process.env.PORT ?? 25565,
    version: process.env.VERSION ?? false,
    username: process.env.USERNAME,
    auth: process.env.AUTH_TYPE
})

bot.on('spawn', () => {
    bot.chat('/balance');
})
// tODO:
// https://api.mojang.com/users/profiles/minecraft/Kashall
// write handler to verify bots to uuid...

bot.on('message', async (json, position) => {
    const message = json.toString().split(' ');
    if (message[0] === 'Current' && message[1] === 'Balance:') {
        const balance = message[2];
        balance.replace('ᛃ', '');
        balance.replace(',', '');

        try {
            const body = {
                uuid: bot.player.uuid,
                balance,
                address: bot.host,
                reason: 'QUERY'
            }

            const response = await fetch('https://api.kashall.dev/eternal/balance', {
                method: 'POST',
                body: JSON.stringify(body),
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            const data = await response.json()
            console.log(data)
        } catch (error) {
            console.log(error)
        }
    }
    if (message[0] === 'From') {
        if (message[3].toLocaleLowerCase() === 'verify') {
            const code = message[4]
            if (!code) return bot.chat(`/tell ${message[1]} No code provided. Sign up at https://bal.kashall.dev/`)
            const { username, uuid } = bot.players[message[1]]
            const query = { _id: uuid, username }
            const existingUser = await users.findOne(query)
            if (!existingUser) return bot.chat(`/tell ${username} You don't have an account yet or you signed up with the wrong uuid. Sign up at https://bal.kashall.dev/`)
            if (existingUser.verification.verified) return bot.chat(`/tell ${username} You're already verified.`)
            if (existingUser.verification.code !== code) return bot.chat(`/tell ${username} This code is invalid. Find this code on https://bal.kashall.dev`)

            const update = {
                $set: {
                    verified: new Date(),
                    "meta.verified": true
                }
            }
            const updatedUser = await users.findOneAndUpdate(query, update)
            if (!updatedUser.ok) return bot.chat(`/tell ${username} Failed to verify user. Please contact Kashall on Discord to fix this.`)
            return bot.chat(`/tell ${username} Successfully verified! Your api key will now be visible from the dashboard.`)
        }
    }
})

bot.on('playerJoined', async (player) => {
    try {
        const { uuid, username } = player
        const result = await uuids.findOne({ uuid })
        if (!result) {
            const data = await uuids.insertOne({ uuid, username })
            console.log(`Created lookup for ${username}:${uuid}\n${data}`)
        } else {
            if (username !== result.username) {
                const data = await uuids.updateOne({ uuid }, {
                    $set: {
                        "username": username
                    }
                })
                console.log(`Updated ${result.username} -> ${username}: ${uuid}\n${data}`)
            }
        }
    } catch (error) {
        console.log(error)
    }
})

const minTimeout = 1800000; // 30min
const variance = 3600000; // 60min
const random = Math.floor(minTimeout + (Math.random() * (variance)))

setInterval(() => {
    bot.chat('/balance')
}, random)

bot.on('error', end);
bot.on('end', end); 

async function end () {
    await client.close()
    process.exit(0)
}