import { MessageEmbed } from "discord.js"
import { Command } from "../../base/Command"
import { getMessageResponse } from "../../utils/responseGetter"

const Community: Command = {
	name: "community",
	description: "Gets a community by ID",
	aliases: [],
	usage: "(id)",
	examples: [],
	category: "communities",
	requiresRoles: false,
	requiresApikey: false,
	run: async ({ client, message, args }) => {
		if (!args[0])
			args[0] = await getMessageResponse(
				message,
				`${client.emotes.type} Provide a community ID to fetch`,
			).then((r) => r?.content?.split(" ")[0] || "")
		const communityId = args.shift()
		if (!communityId)
			return message.channel.send(
				`${client.emotes.warn} No community ID was provided`,
			)
		const community = await client.fagc.communities.fetchCommunity({
			communityId: communityId,
		})
		if (!community)
			return message.channel.send(
				`${client.emotes.warn} Community with the ID \`${communityId}\` does not exist!`,
			)

		const embed = new MessageEmbed()
			.setTitle("FAGC Communities")
			.setColor("GREEN")
			.setTimestamp()
			.setAuthor({ name: client.config.embeds.author })
			.setFooter({ text: client.config.embeds.footer })

		const user = await client.users.fetch(community.contact).catch(() => null)
		embed.addFields({
			name: `${community.name} | \`${community.id}\``,
			value: `Contact: <@${user?.id}> | ${user?.tag}`,
		})
		return message.channel.send({
			embeds: [embed],
		})
	},
}

export default Community
