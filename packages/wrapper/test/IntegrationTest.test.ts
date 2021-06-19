import config from "./testconfig"
import { FAGCWrapper, Revocation, Violation } from "../src/index"

import { expect } from "chai"

import { step } from "mocha-steps"

const FAGC = new FAGCWrapper({
	apikey: config.apikey,
	socketurl: config.websocketurl,
	apiurl: config.apiurl
})

const testGuildId = "749943992719769613"
const testUserId = "429696038266208258"
const testStuff = {
	violation: {
		automated: false,
		description: "i like potatoes",
		proof: "not gonna give it to ya",
		playername: "Windsinger",
	},
	violationCount: 5,
	webhookId: "855703411228147743",
	webhookToken: "pbMuJ4CN-R-YZTsUL2JCLGHJ-bD7zIjLbMT_AV45ROjiRyJughxvgJ5Mc1VZ1cIAhLQ2"
}

describe("ApiWrapper", () => {
	beforeEach(() => {
		// clear all caches
		FAGC.communities.cache.clear()
		FAGC.violations.cache.clear()
		FAGC.revocations.cache.clear()
		FAGC.rules.cache.clear()
	})
	step("Should be able to fetch rules and cache them", async () => {
		const rules = await FAGC.rules.fetchAll()
		const rule = FAGC.rules.resolveID(rules[0]?.id)
		expect(rules[0]?.id).to.equal(rule?.id, "Cached rules improperly")
	})
	step("Should be able to fetch communities and cache them", async () => {
		const communities = await FAGC.communities.fetchAll()
		const community = FAGC.communities.resolveID(communities[0]?.id)
		expect(communities[0]?.id).to.equal(community?.id, "Cached communities improperly")
	})
	step("Should be able to set and get configs properly", async () => {
		const oldConfig = await FAGC.communities.fetchConfig(testGuildId)
		expect(oldConfig?.guildId).to.equal(testGuildId, "Guild configs fetched improperly")
		const newName = "OOF2 BANBOT"
		const newConfig = await FAGC.communities.setConfig({
			communityname: newName
		})
		expect(newConfig.communityname).to.equal(newName, "Community config names were set improperly")

		// reset community name after test
		await FAGC.communities.setConfig({
			communityname: oldConfig.communityname
		})
	})
	step("Should be able to create a violation, cache it, fetch it by community, and revoke it", async () => {
		const rules = await FAGC.rules.fetchAll()
		const violation = await FAGC.violations.create({
			brokenRule: rules[0].id,
			adminId: testUserId,
			...testStuff.violation, // description, automated, proof, playername
		})
		expect(violation.adminId).to.equal(testUserId, "Violation admin ID mismatch")
		expect(violation.playername).to.equal(testStuff.violation.playername, "Violation playername mismatch")
		expect(violation.brokenRule).to.equal(rules[0].id, "Violation rule mismatch")
		expect(violation.description).to.equal(testStuff.violation.description, "Violation description mismatch")
		expect(violation.automated).to.equal(testStuff.violation.automated, "Violation automated mismatch")
		expect(violation.proof).to.equal(testStuff.violation.proof, "Violation proof mismatch")

		const resolvedViolation = FAGC.violations.resolveID(violation.id)
		expect(resolvedViolation).to.deep.equal(violation, "Cached violation mismatch to violation")

		const revocation = await FAGC.violations.revoke(violation.id, testUserId)
		// equal violation
		expect(revocation.adminId).to.equal(violation.adminId, "Revocation adminId mismatch")
		expect(revocation.playername).to.equal(violation.playername, "Revocation playername mismatch")
		expect(revocation.brokenRule).to.equal(violation.brokenRule, "Revocation brokenRule mismatch")
		expect(revocation.description).to.equal(violation.description, "Revocation description mismatch")
		expect(revocation.automated).to.equal(violation.automated, "Revocation automated mismatch")
		expect(revocation.proof).to.equal(violation.proof, "Revocation proof mismatch")
		expect(revocation.violatedTime).to.equal(violation.violatedTime, "Revocation time mismatch")
		// revocation specific
		expect(revocation.revokedBy).to.equal(testUserId, "Revocation revokedBy mismatch")

		const resolvedViolationAfterRevoked = FAGC.violations.resolveID(violation.id)
		expect(resolvedViolationAfterRevoked, "Violation not removed from cache properly").to.be.null
	})
	step("Should be able to create multiple violations, cache them and revoke them", async () => {
		const rules = await FAGC.rules.fetchAll()
		const createdViolations = await Promise.all(new Array(testStuff.violationCount).fill(0).map(() => {
			return FAGC.violations.create({
				brokenRule: rules[0].id,
				adminId: testUserId,
				...testStuff.violation, // description, automated, proof, playername
			})
		}))
		createdViolations.forEach(violation => {
			// check that all violations were created correctly
			expect(violation.adminId).to.equal(testUserId, "Violation admin ID mismatch")
			expect(violation.playername).to.equal(testStuff.violation.playername, "Violation playername mismatch")
			expect(violation.brokenRule).to.equal(rules[0].id, "Violation rule mismatch")
			expect(violation.description).to.equal(testStuff.violation.description, "Violation description mismatch")
			expect(violation.automated).to.equal(testStuff.violation.automated, "Violation automated mismatch")
			expect(violation.proof).to.equal(testStuff.violation.proof, "Violation proof mismatch")

			// check resolved violation
			const resolved = FAGC.violations.resolveID(violation.id)
			expect(resolved).to.deep.equal(violation, "Cached violation mismatch to violation")
		})

		const violations = await FAGC.violations.fetchAllName(testStuff.violation.playername)
		const revocations = await FAGC.violations.revokeAllName(testStuff.violation.playername, testUserId)
		expect(revocations.length).to.equal(violations.length, "Amount of player violations and revocations mismatch")
		revocations.forEach((revocation, i) => {
			const violation = violations[i]
			// equal violation
			expect(revocation.adminId).to.equal(violation.adminId, "Revocation adminId mismatch")
			expect(revocation.playername).to.equal(violation.playername, "Revocation playername mismatch")
			expect(revocation.brokenRule).to.equal(violation.brokenRule, "Revocation brokenRule mismatch")
			expect(revocation.description).to.equal(violation.description, "Revocation description mismatch")
			expect(revocation.automated).to.equal(violation.automated, "Revocation automated mismatch")
			expect(revocation.proof).to.equal(violation.proof, "Revocation proof mismatch")
			expect(revocation.violatedTime).to.equal(violation.violatedTime, "Revocation time mismatch")
			// revocation specific
			expect(revocation.revokedBy).to.equal(testUserId, "Revocation revokedBy mismatch")
		})

		violations.forEach(violation => {
			// make sure that violations are removed from cache
			const resolved = FAGC.violations.resolveID(violation.id)
			expect(resolved, "Violation not removed from cache properly").to.be.null
		})
	})
	step("Should be able to create violations and get an offense from them", async () => {
		before(async () => await FAGC.violations.revokeAllName(testStuff.violation.playername, testUserId))
		after(async () => await FAGC.violations.revokeAllName(testStuff.violation.playername, testUserId))

		const rules = await FAGC.rules.fetchAll()
		await Promise.all(new Array(testStuff.violationCount).fill(0).map(() => {
			return FAGC.violations.create({
				brokenRule: rules[0].id,
				adminId: testUserId,
				...testStuff.violation, // description, automated, proof, playername
			})
		}))
		const fetchedViolations = await FAGC.violations.fetchAllName(testStuff.violation.playername)
		const offense = await FAGC.offenses.fetchCommunity(testStuff.violation.playername, fetchedViolations[0].communityId)
		expect(offense.violations.length).to.equal(fetchedViolations.length, "Amount of fetched violations and violations in offense did not match")
		expect(fetchedViolations).to.deep.equal(offense.violations, "Fetched violations did not match violations in offense")
		expect(offense.playername).to.equal(testStuff.violation.playername, "Given playername and offense playername mismatch")
		expect(offense.communityId).to.equal(fetchedViolations[0].communityId, "Community IDs mismatch")
	})
	step("Addition and removal of webhooks should work", async () => {
		before(async () => {
			return await FAGC.info.removeWebhook(testStuff.webhookId, testStuff.webhookToken, testGuildId)
		})

		const added = await FAGC.info.addWebhook(testStuff.webhookId, testStuff.webhookToken, testGuildId)
		expect(added.id).to.equal(testStuff.webhookId, "Webhook Creation IDs mismatch")
		expect(added.token).to.equal(testStuff.webhookToken, "Webhook Creation token mismatch")
		expect(added.guildId).to.equal(testGuildId, "Webhook Creation guild IDs mismatch")

		const removed = await FAGC.info.removeWebhook(testStuff.webhookId, testStuff.webhookToken, testGuildId)
		expect(removed.id).to.equal(testStuff.webhookId, "Webhook Removal IDs mismatch")
		expect(removed.token).to.equal(testStuff.webhookToken, "Webhook Removal token mismatch")
		expect(removed.guildId).to.equal(testGuildId, "Webhook Removal guild IDs mismatch")
	})
	step("Violation WebSocket event should work", async () => {
		// before(async () => await FAGC.violations.revokeAllName(testStuff.violation.playername, testUserId).catch())
		// after(async () => await FAGC.violations.revokeAllName(testStuff.violation.playername, testUserId).catch())

		const rules = await FAGC.rules.fetchAll()
		const ViolationHandler = (evt: Violation) => {
			expect(evt.id).to.equal(violation.id, "Event Violation ID mismatch")
			expect(evt.adminId).to.equal(violation.adminId, "Event Violation admin ID mismatch")
			expect(evt.playername).to.equal(violation.playername, "Event Violation playername mismatch")
			expect(evt.brokenRule).to.equal(violation.brokenRule, "Event Violation rule mismatch")
			expect(evt.description).to.equal(violation.description, "Event Violation description mismatch")
			expect(evt.automated).to.equal(violation.automated, "Event Violation automated mismatch")
			expect(evt.proof).to.equal(violation.proof, "Event Violation proof mismatch")
		}
		const RevocationHandler = (evt: Revocation) => {
			// violation stuff
			expect(evt.id).to.equal(revocation.id, "Event Revocation ID mismatch")
			expect(evt.adminId).to.equal(revocation.adminId, "Event Revocation admin ID mismatch")
			expect(evt.playername).to.equal(revocation.playername, "Event Revocation playername mismatch")
			expect(evt.brokenRule).to.equal(revocation.brokenRule, "Event Revocation rule mismatch")
			expect(evt.description).to.equal(revocation.description, "Event Revocation description mismatch")
			expect(evt.automated).to.equal(revocation.automated, "Event Revocation automated mismatch")
			expect(evt.proof).to.equal(revocation.proof, "Event Revocation proof mismatch")

			// revocation stuff
			expect(evt.revokedBy).to.equal(revocation.revokedBy, "Event Revocation revokedBy mismatch")
			expect(evt.revokedTime).to.equal(revocation.revokedTime, "Event Revocation revokedTime mismatch")
		}
		FAGC.websocket.once("violation", ViolationHandler)
		FAGC.websocket.on("revocation", RevocationHandler)
		const violation = await FAGC.violations.create({
			brokenRule: rules[0].id,
			adminId: testUserId,
			...testStuff.violation, // description, automated, proof, playername
		})
		const revocation = await FAGC.violations.revoke(violation.id, testUserId)
	})
})