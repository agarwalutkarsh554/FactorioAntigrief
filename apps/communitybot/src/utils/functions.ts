import { MessageEmbed, EmbedField, Message, MessageEmbedOptions, CollectorFilter, User, Guild } from "discord.js"
import FAGCBot from "../base/fagcbot"

export async function createPagedEmbed(
	fields: EmbedField[],
	embedMsgOptions: MessageEmbed | MessageEmbedOptions,
	message: Message,
	options: {
		maxPageCount?: number
	} = {}
) {
	const newOptions = {
		maxPageCount: 25,
		...options,
	}
	if (newOptions.maxPageCount > 25) newOptions.maxPageCount = 25 // discord limit is 25 things per embed
	let embed = new MessageEmbed(embedMsgOptions)
	let page = 0
	// if the amount of pages is 1 then there is actually only one page, f.e. 5/5 = 1 but the program will work with 0, 1
	let maxPages = Math.floor(fields.length / newOptions.maxPageCount)
	embed.fields = fields.slice(0, options.maxPageCount)
	let embedMsg = await message.channel.send({
		embeds: [embed],
	})

	const setData = async () => {
		const start = page * newOptions.maxPageCount
		embed.fields = fields.slice(start, start + newOptions.maxPageCount)
		embedMsg = await embedMsg.edit({
			embeds: [embed],
		})
	}
	const removeReaction = async (emoteName: string) => {
		const foundReaction = embedMsg.reactions.cache.find((r) => r.emoji.name === emoteName)
		if (foundReaction) foundReaction.users.remove(message.author.id)
			
	}
	// if there is only 1 page then no sense to make arrows, just slows other reactions down
	if (maxPages) {
		await embedMsg.react("⬅️")
		await embedMsg.react("➡️")
	}
	await embedMsg.react("🗑️")

	const reactionCollector = embedMsg.createReactionCollector({
		filter: (reaction, user) => user.id === message.author.id,
		time: 120000,
	})

	// remove reactions after timeout runs out
	setTimeout(async () => {
		await embedMsg.reactions.cache.get("⬅️")?.remove().catch()
		await embedMsg.reactions.cache.get("➡️")?.remove().catch()
		await embedMsg.reactions.cache.get("🗑️")?.remove().catch()
	}, 120000)

	reactionCollector.on("collect", (reaction) => {
		switch (reaction.emoji.name) {
		case "⬅️": {
			page--
			removeReaction("⬅️") // remove the user's reaction no matter what
			if (page <= -1) page = 0
			else setData()
			break
		}
		case "➡️": {
			page++
			removeReaction("➡️") // remove the user's reaction no matter what
			if (page > maxPages) page = maxPages
			else setData()
			break
		}
		case "🗑️": {
			reactionCollector.stop()
			embedMsg.delete()
			message.delete()
		}
		}
	})
}

export async function joinGuild(guild: Guild, client: FAGCBot) {
	const guildOwner = await guild.fetchOwner()
	// create initial config only if it doesn't exist yet
	client.fagc.communities.fetchGuildConfig({
		guildId: guild.id,
	}).then((config) => {
		if (config) return
		console.log(`Creating config for guild with ID ${guild.id}`)
		client.fagc.communities.createGuildConfig({
			guildId: guild.id,
		})
	})
	let embed = new MessageEmbed()
		.setTitle("Welcome to FAGC")
		.setColor(client.config.embeds.color)
		.setFooter(client.config.embeds.footer)
		.setTimestamp()
	embed.addFields(
		{ name: "FAGC Invite", value: client.config.fagcInvite },
		{
			name: "Initial Setup",
			value:
				"We assume that you want to set your guild up. For now, your guild data has been set to a few defaults, " +
				"such as the guild contact being the guild's owner. Everything with the API is readonly until you run `fagc!setapikey`. " +
				"Run `fagc!help` to view command help. Commands don't work in DMs!",
		},
		{
			name: "Bot Prefix",
			value: "The bot prefix is, and always will be, `fagc!`. This is displayed in the bot's status",
		}
	)

	const owner = () => {
		guildOwner.send({
			embeds: [embed]
		})
			.catch(() => console.log(`Could not send embed for guild ID ${guild.id}`))
	}

	const systemChannel = () => {
		if (guild.systemChannel) guild.systemChannel.send({
			embeds: [embed]
		}).catch(() => owner())
		else owner()
	}

	const publicUpdates = () => {
		if (guild.publicUpdatesChannel) guild.publicUpdatesChannel.send({
			embeds: [embed]
		}).catch(() => systemChannel())
		else systemChannel()
	}
	publicUpdates()
}
