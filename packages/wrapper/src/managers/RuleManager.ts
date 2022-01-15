import fetch from "isomorphic-fetch"
import { ManagerOptions, WrapperOptions } from "../types/types"
import { Rule } from "fagc-api-types"
import BaseManager from "./BaseManager"
import strictUriEncode from "strict-uri-encode"
import { GenericAPIError } from "../types"
import { FetchRequestTypes } from "../types/privatetypes"
import { masterAuthenticate } from "../utils"
import { z } from "zod"

export class RuleManager extends BaseManager<Rule> {
	constructor(options: WrapperOptions, managerOptions: ManagerOptions = {}) {
		super(managerOptions)
		this.apiurl = options.apiurl
		if (options.apikey) this.apikey = options.apikey
		if (options.masterapikey) this.masterapikey = options.masterapikey
	}
	
	async fetchAll({ cache = true }: FetchRequestTypes): Promise<Rule[]> {
		const allRules = await fetch(`${this.apiurl}/rules`, {
			credentials: "include",
		}).then((r) => r.json())

		const parsed = z.array(Rule).parse(allRules)
		if (cache) parsed.map(rule => this.add(rule))
		return parsed
	}

	async create({
		rule,
		cache = true,
		reqConfig = {},
	}: {
		rule: Omit<Rule, "id">,
	} & FetchRequestTypes): Promise<Rule> {
		const data = await fetch(`${this.apiurl}/rules`, {
			method: "POST",
			body: JSON.stringify(rule),
			credentials: "include",
			headers: {
				authorization: masterAuthenticate(this, reqConfig),
				"content-type": "application/json",
			},
		}).then((r) => r.json())

		if (data.error) throw new GenericAPIError(`${data.error}: ${data.message}`)

		const parsed = Rule.parse(data)
		if (cache) this.add(parsed)
		return parsed
	}

	async fetchRule({
		ruleid,
		cache = true,
		force = false
	}: {
		ruleid: string
	} & FetchRequestTypes): Promise<Rule | null> {
		if (!force) {
			const cached =
				this.cache.get(ruleid) || this.fetchingCache.get(ruleid)
			if (cached) return cached
		}
		let promiseResolve!: (value: Rule | PromiseLike<Rule | null> | null) => void
		const fetchingPromise: Promise<Rule | null> = new Promise((resolve) => {
			promiseResolve = resolve
		})

		this.fetchingCache.set(ruleid, fetchingPromise)

		const fetched = await fetch(
			`${this.apiurl}/rules/${strictUriEncode(ruleid)}`,
			{
				credentials: "include",
			}
		).then((r) => r.json())

		const parsed = Rule.nullable().safeParse(fetched)
		if (!parsed.success || parsed.data === null) {
			promiseResolve(null)
			setTimeout(() => this.fetchingCache.delete(ruleid), 0)
			if (!parsed.success) throw parsed.error
			return null
		}

		if (cache) this.add(parsed.data)
		promiseResolve(fetched)
		setTimeout(() => {
			this.fetchingCache.sweep((data) => typeof data.then === "function")
		}, 0)
		if (fetched.id === ruleid) return fetched
		return null
	}

	async modify({
		id,
		shortdesc, longdesc,
		reqConfig = {}
	}: {
		id: string,
		shortdesc?: string, longdesc?: string
	} & FetchRequestTypes): Promise<Rule | null> {
		const data = await fetch(
			`${this.apiurl}/rules/${strictUriEncode(id)}`,
			{
				method: "PATCH",
				credentials: "include",
				body: JSON.stringify({
					shortdesc: shortdesc,
					longdesc: longdesc
				}),
				headers: {
					authorization: masterAuthenticate(this, reqConfig),
					"content-type": "application/json",
				},
			}
		).then((r) => r.json())

		if (data.error)
			throw new GenericAPIError(`${data.error}: ${data.message}`)
		
		const parsed = Rule.parse(data)

		// remove old rule from cache and add new rule
		this.removeFromCache(parsed)
		this.add(parsed)

		return parsed
	}

	async remove({
		id,
		reqConfig = {}
	}: {
		id: string,
	} & FetchRequestTypes): Promise<Rule | null> {
		const data = await fetch(
			`${this.apiurl}/rules/${strictUriEncode(id)}`,
			{
				method: "DELETE",
				credentials: "include",
				headers: {
					authorization: masterAuthenticate(this, reqConfig),
					"content-type": "application/json",
				},
			}
		).then((r) => r.json())

		if (data.error) throw new GenericAPIError(`${data.error}: ${data.message}`)
		const parsed = Rule.parse(data)
		this.removeFromCache(parsed)

		return parsed
	}

	async merge({
		idReceiving,
		idDissolving,
		reqConfig = {}
	}: {
		idReceiving: string
		idDissolving: string
		} & FetchRequestTypes): Promise<Rule> {
		const data = await fetch(
			`${this.apiurl}/rules/${strictUriEncode(idReceiving)}/merge/${strictUriEncode(idDissolving)}`,
			{
				method: "PATCH",
				credentials: "include",
				headers: {
					authorization: masterAuthenticate(this, reqConfig),
				},
			}
		).then((r) => r.json())

		if (data.error)
			throw new GenericAPIError(`${data.error}: ${data.message}`)
		
		const parsed = Rule.parse(data)
		this.removeFromCache(parsed)
		return parsed
	}
}
