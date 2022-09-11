import { FAGCWrapper } from "fagc-api-wrapper"
import { GuildConfig, Community, FilterObject } from "fagc-api-types"
import ENV from "../utils/env.js"
import { Client, ClientOptions, Collection, MessageEmbed } from "discord.js"
import { Command as CommandType } from "./Commands.js"
import * as database from "./database.js"
import wshandler from "./wshandler.js"
import RCONInterface from "./rcon.js"
import fs from "fs"
import { z } from "zod"
import { Connection } from "typeorm"
import BotConfig from "../database/BotConfig.js"
import InfoChannel from "../database/InfoChannel.js"
import { WebSocketEvents } from "fagc-api-wrapper/dist/WebsocketListener"
import FAGCBan from "../database/FAGCBan.js"

function getServers(): database.FactorioServerType[] {
	const serverJSON = fs.readFileSync(ENV.SERVERSFILEPATH, "utf8")
	const servers = z
		.array(database.FactorioServer)
		.parse(JSON.parse(serverJSON))
	return servers
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface BotOptions extends ClientOptions {
	database: Connection
}
export default class FAGCBot extends Client {
	fagc: FAGCWrapper
	db: Connection
	commands: Collection<string, CommandType>
	// private _botConfig so that it can be accessed any time from external code with the botConfig getter
	private _botConfig: database.BotConfigType | null = null
	/**
	 * Info channels
	 */
	infochannels: InfoChannel[] = []
	/**
	 * Guild configs, by guild ID
	 */
	guildConfig: GuildConfig | null = null
	community: Community | null = null
	embedQueue: Collection<string, MessageEmbed[]>
	servers: database.FactorioServerType[] = []
	filterObject: FilterObject | null = null
	readonly rcon: RCONInterface
	serverSyncedActions: ServerSyncedAction[] = []

	constructor(options: BotOptions) {
		super(options)
		this.db = options.database
		this.fagc = new FAGCWrapper({
			apiurl: ENV.APIURL,
			socketurl: ENV.WSURL,
			enableWebSocket: true,
			apikey: ENV.APIKEY,
		})
		this.commands = new Collection()

		this.embedQueue = new Collection()

		this.servers = getServers()

		this.rcon = new RCONInterface(this, this.servers)

		// load info channels
		this.db
			.getRepository(InfoChannel)
			.find()
			.then((channels) => (this.infochannels = channels))
		// load bot config or create one if it doesnt exist yet
		this.db
			.getRepository(BotConfig)
			.findOne()
			.then((x) => {
				if (x) return (this._botConfig = x)
				this.setBotConfig({
					guildId: ENV.GUILDID,
				})
			})

		// load fagc guild config
		this.fagc.communities
			.fetchGuildConfig({ guildId: ENV.GUILDID })
			.then((config) => (this.guildConfig = config))

		// register listeners for parsing WS notifications
		Object.entries(wshandler).forEach(([eventname, handler]) => {
			if (!handler) return
			this.fagc.websocket.on(
				eventname as keyof WebSocketEvents,
				async (event: any) => {
					await handler({ event, client: this })
					this.setBotConfig({
						lastNotificationProcessed: new Date(),
					})
				}
			)
		})

		setInterval(() => this.sendEmbeds(), 10 * 1000) // send embeds every 10 seconds
		setInterval(() => this.clearServerSyncedActions(), 5 * 60 * 1000) // clear recent bans every minute
	}

	get botConfig(): database.BotConfigType {
		if (this._botConfig) return this._botConfig
		return {
			guildId: ENV.GUILDID,
			owner: ENV.OWNERID,
			lastNotificationProcessed: new Date(0),
			reportAction: "ban",
			revocationAction: "unban",
		}
	}

	async setBotConfig(config: Partial<database.BotConfigType>) {
		await this.db
			.getRepository(BotConfig)
			.upsert({ ...config, guildId: config.guildId ?? ENV.GUILDID }, [
				"guildId",
			])
		const record = await this.db.getRepository(BotConfig).findOneOrFail()
		this._botConfig = record
	}

	private sendEmbeds() {
		for (const [channelId] of this.embedQueue) {
			const embeds = this.embedQueue.get(channelId)?.splice(0, 10) ?? []
			if (!embeds.length) continue
			const channel = this.channels.resolve(channelId)
			if (!channel || !channel.isNotDMChannel()) continue
			channel.send({ embeds: embeds })
		}
	}

	addEmbedToQueue(channelId: string, embed: MessageEmbed) {
		const channel = this.channels.resolve(channelId)
		if (!channel || !channel.isNotDMChannel()) return false
		if (this.embedQueue.has(channelId)) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			this.embedQueue.set(channelId, [
				...this.embedQueue.get(channelId)!,
				embed,
			])
		} else {
			this.embedQueue.set(channelId, [embed])
		}
	}

	createBanCommand(report: Omit<FAGCBan, "createdAt" | "removedAt">) {
		const botConfig = this.botConfig

		const rawBanMessage =
			botConfig.reportAction === "ban"
				? ENV.BANCOMMAND
				: ENV.CUSTOMBANCOMMAND
		const command = rawBanMessage
			.replaceAll("{COMMUNITYID}", report.communityId)
			.replaceAll("{REPORTID}", report.id)
			.replaceAll("{PLAYERNAME}", report.playername)
		return command
	}

	createUnbanCommand(playername: string) {
		const botConfig = this.botConfig
		if (!botConfig || botConfig.revocationAction === "none") return false

		const rawUnbanMessage =
			botConfig.reportAction === "ban"
				? ENV.UNBANCOMMAND
				: ENV.CUSTOMUNBANCOMMAND
		const command = rawUnbanMessage.replaceAll("{PLAYERNAME}", playername)
		return command
	}

	/**
	 * Remove cached records of recent actions from servers
	 * @param removeAll If true, records of all actions will be removed. If false, only records older than 5 minutes will be removed.
	 */
	clearServerSyncedActions(removeAll = false) {
		if (removeAll) {
			this.serverSyncedActions = []
			return
		}

		this.serverSyncedActions = this.serverSyncedActions.filter((action) => {
			// if the record is not older than 5 minutes, keep it
			if (action.receivedAt.valueOf() + 5 * 60 * 1000 > Date.now()) {
				return true
			}
			return false
		})
	}
}
