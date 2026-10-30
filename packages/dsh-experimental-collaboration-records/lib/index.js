import { randomUUID } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { TeamTaskId } from "@deepseek-ai/dsh-experimental-agent-team";
import { HarnessError } from "@deepseek-ai/dsh-llm";
import { SessionId, appendPluginRecord, pluginRecordOf } from "@deepseek-ai/dsh-session";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { z as z$1 } from "zod";
//#region lib/types/projection.js
/**
* Fold Lead-authored collaboration records from `plugin:collaboration-records/record`
* events into the `collaborationRecords` Session projection.
*
* Every plugin record is one complete record version. The fold keys records by
* `recordId` in first-creation order and appends versions in ascending revision
* order. Replay, checkpoint restore, and fork inheritance fold the same way:
* the fold is synchronous, deterministic, and performs no I/O.
*
* @module @deepseek-ai/dsh-experimental-collaboration-records/projection
*/
/** Persisted plugin record type that carries one whole record version. */
const COLLABORATION_RECORD_TYPE = "plugin:collaboration-records/record";
const nonNegativeSafeInteger = z$1.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveSafeInteger = nonNegativeSafeInteger.min(1);
const sessionIdSchema = z$1.string().min(1).transform((value) => SessionId(value));
const teamTaskIdSchema = z$1.string().min(1).transform((value) => TeamTaskId(value));
const referenceSchema = z$1.object({
	sessionId: sessionIdSchema,
	seq: nonNegativeSafeInteger
}).strict();
const pendingItemSchema = z$1.object({
	id: z$1.string().min(1),
	text: z$1.string().min(1)
}).strict();
const associationsSchema = z$1.object({
	taskIds: z$1.array(teamTaskIdSchema),
	memberSessionIds: z$1.array(sessionIdSchema)
}).strict();
/** One persisted whole-value record version. */
const collaborationRecordVersionSchema = z$1.object({
	recordId: z$1.string().min(1),
	revision: positiveSafeInteger,
	title: z$1.string().min(1),
	summary: z$1.string().min(1),
	content: z$1.string(),
	associations: associationsSchema,
	references: z$1.array(referenceSchema),
	pending: z$1.array(pendingItemSchema),
	authorSessionId: sessionIdSchema,
	authorName: z$1.string().min(1)
}).strict();
const versionEntrySchema = z$1.object({
	version: collaborationRecordVersionSchema,
	seq: nonNegativeSafeInteger,
	time: nonNegativeSafeInteger
}).strict();
const recordEntrySchema = z$1.object({
	recordId: z$1.string().min(1),
	latest: collaborationRecordVersionSchema,
	versions: z$1.array(versionEntrySchema).min(1),
	updatedSeq: nonNegativeSafeInteger,
	updatedTime: nonNegativeSafeInteger
}).strict();
/** Checkpoint-safe state schema; a state that fails it is never seeded into a fold. */
const collaborationRecordsStateSchema = z$1.object({ records: z$1.array(recordEntrySchema) }).strict();
const versionViewSchema = z$1.object({
	revision: positiveSafeInteger,
	seq: nonNegativeSafeInteger,
	time: nonNegativeSafeInteger,
	title: z$1.string(),
	summary: z$1.string(),
	content: z$1.string(),
	associations: associationsSchema,
	references: z$1.array(referenceSchema),
	pending: z$1.array(pendingItemSchema)
}).strict();
const recordViewSchema = z$1.object({
	recordId: z$1.string().min(1),
	revision: positiveSafeInteger,
	title: z$1.string(),
	summary: z$1.string(),
	content: z$1.string(),
	authorName: z$1.string(),
	updatedTime: nonNegativeSafeInteger,
	updatedSeq: nonNegativeSafeInteger,
	associations: associationsSchema,
	references: z$1.array(referenceSchema),
	pending: z$1.array(pendingItemSchema),
	versions: z$1.array(versionViewSchema)
}).strict();
const viewSchema = z$1.object({ records: z$1.array(recordViewSchema) }).strict();
/** Client views keyed by the immutable fold state that produced them. */
const viewCache = /* @__PURE__ */ new WeakMap();
function versionView(entry) {
	const version = entry.version;
	return {
		revision: version.revision,
		seq: entry.seq,
		time: entry.time,
		title: version.title,
		summary: version.summary,
		content: version.content,
		associations: version.associations,
		references: version.references,
		pending: version.pending
	};
}
/**
* Client view of one fold state. The view reference is reused while the state
* reference is unchanged, so a live drive publishes nothing for internal-only
* state changes.
* @param state - current fold state.
* @returns the complete client value.
*/
function collaborationRecordsView(state) {
	const cached = viewCache.get(state);
	if (cached !== void 0) return cached;
	const view = { records: state.records.map((entry) => ({
		recordId: entry.recordId,
		revision: entry.latest.revision,
		title: entry.latest.title,
		summary: entry.latest.summary,
		content: entry.latest.content,
		authorName: entry.latest.authorName,
		updatedTime: entry.updatedTime,
		updatedSeq: entry.updatedSeq,
		associations: entry.latest.associations,
		references: entry.latest.references,
		pending: entry.latest.pending,
		versions: entry.versions.map(versionView)
	})) };
	viewCache.set(state, view);
	return view;
}
function applyRecordVersion(state, version, seq, time) {
	const index = state.records.findIndex((entry) => entry.recordId === version.recordId);
	if (index < 0) {
		if (version.revision !== 1) return state;
		return { records: [...state.records, {
			recordId: version.recordId,
			latest: version,
			versions: [{
				version,
				seq,
				time
			}],
			updatedSeq: seq,
			updatedTime: time
		}] };
	}
	const current = state.records[index];
	if (current === void 0) return state;
	if (version.revision !== current.latest.revision + 1) return state;
	const records = [...state.records];
	records[index] = {
		...current,
		latest: version,
		versions: [...current.versions, {
			version,
			seq,
			time
		}],
		updatedSeq: seq,
		updatedTime: time
	};
	return { records };
}
function applyEvent(state, event) {
	const record = pluginRecordOf(event);
	if (record?.type !== "plugin:collaboration-records/record") return state;
	const parsed = collaborationRecordVersionSchema.safeParse(record.data);
	if (!parsed.success) return state;
	return applyRecordVersion(state, parsed.data, event.seq, event.time);
}
/** The `collaborationRecords` projection: whole-value record versions folded by record id. */
const collaborationRecordsProjection = {
	key: "collaborationRecords",
	stateVersion: 1,
	stateSchema: collaborationRecordsStateSchema,
	init: (_header, _inheritedEventCount) => ({ records: [] }),
	apply: applyEvent,
	wire: {
		summary: false,
		viewSchema,
		view: collaborationRecordsView
	}
};
//#endregion
//#region lib/types/index.js
/**
* Lead-authored collaboration records: the `write_collaboration_record` tool,
* the `collaborationRecords` Session projection, and the Lead-scoped policy
* section that explains when to write or revise a record.
*
* Only the exact live Team Lead discovers and runs the tool. Every write is one
* whole-value plugin record; the Host derives the author from the calling Lead
* Session and performs the expected-revision check and the append in one
* synchronous span so two writes cannot interleave between check and commit.
*
* @module @deepseek-ai/dsh-experimental-collaboration-records
*/
/** Cordis plugin name. */
const name = "collaboration-records";
/** Services required by the Lead record plugin. */
const inject = [
	"agents",
	"agentTeams",
	"sessions",
	"sessionProjections",
	"systemPrompt"
];
/** Model-facing name of the Lead record tool. */
const WRITE_RECORD_TOOL = "write_collaboration_record";
/** Name of the Lead-scoped system-prompt section. */
const POLICY_SECTION = "collaboration:policy";
/** Fixed model-facing collaboration-record policy contributed to every Lead scope. */
const COLLABORATION_POLICY = `You are the Team Lead and the only author of collaboration records in this Team. Call write_collaboration_record when the Team's shared work reaches a fact that the user or teammates must be able to read later: a decision, a delivered result, or an open question reserved for the user. A record is a Lead summary layered over execution; it never replaces or rewrites the execution facts in the session log.

Revise one record instead of writing another when its facts change: pass the record_id and the current revision as expected_revision. A conflict result names the currentRevision; re-read it and retry, and never drop an earlier version. Keep associations.task_ids and associations.member_session_ids to ids that already exist, and keep references to real events; do not add associations you cannot verify.

pending items are decisions reserved for a human: you cannot resolve them, and a revision replaces the list. Each write returns the revision to pass when revising next.`;
const DEFAULT_LIMITS = {
	maxTitleLength: 200,
	maxSummaryLength: 500,
	maxContentLength: 8e3,
	maxAssociations: 64,
	maxReferences: 32,
	maxPending: 20,
	maxPendingTextLength: 500
};
/** Loader schema for the record bounds. */
const Config = z.object({
	maxTitleLength: z.number().step(1).min(1).default(DEFAULT_LIMITS.maxTitleLength),
	maxSummaryLength: z.number().step(1).min(1).default(DEFAULT_LIMITS.maxSummaryLength),
	maxContentLength: z.number().step(1).min(1).default(DEFAULT_LIMITS.maxContentLength),
	maxAssociations: z.number().step(1).min(1).default(DEFAULT_LIMITS.maxAssociations),
	maxReferences: z.number().step(1).min(1).default(DEFAULT_LIMITS.maxReferences),
	maxPending: z.number().step(1).min(1).default(DEFAULT_LIMITS.maxPending),
	maxPendingTextLength: z.number().step(1).min(1).default(DEFAULT_LIMITS.maxPendingTextLength)
});
/** Argument names that would forge the server-derived author; none is accepted. */
const AUTHOR_ARGUMENT_KEYS = [
	"author",
	"authorName",
	"author_name",
	"authorSessionId",
	"author_session_id"
];
/** A refused or failed collaboration-record write with a stable machine-readable code. */
var CollaborationRecordError = class extends HarnessError {};
function argumentError(message) {
	return new CollaborationRecordError(message, "COLLABORATION_RECORD_ARGS");
}
function forbiddenError(message) {
	return new CollaborationRecordError(message, "COLLABORATION_RECORD_FORBIDDEN");
}
function associationError(message) {
	return new CollaborationRecordError(message, "COLLABORATION_RECORD_ASSOCIATION");
}
function referenceError(message) {
	return new CollaborationRecordError(message, "COLLABORATION_RECORD_REFERENCE");
}
/** Resolve direct-composition config values over the deployment defaults. */
function resolveLimits(config) {
	return {
		maxTitleLength: config.maxTitleLength ?? DEFAULT_LIMITS.maxTitleLength,
		maxSummaryLength: config.maxSummaryLength ?? DEFAULT_LIMITS.maxSummaryLength,
		maxContentLength: config.maxContentLength ?? DEFAULT_LIMITS.maxContentLength,
		maxAssociations: config.maxAssociations ?? DEFAULT_LIMITS.maxAssociations,
		maxReferences: config.maxReferences ?? DEFAULT_LIMITS.maxReferences,
		maxPending: config.maxPending ?? DEFAULT_LIMITS.maxPending,
		maxPendingTextLength: config.maxPendingTextLength ?? DEFAULT_LIMITS.maxPendingTextLength
	};
}
const OUTPUT_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		recordId: {
			type: "string",
			required: true,
			description: "Stable collaboration record identity."
		},
		revision: {
			type: "integer",
			required: true,
			description: "Revision this write created."
		},
		seq: {
			type: "integer",
			required: true,
			description: "Session event seq of this record version."
		},
		time: {
			type: "integer",
			required: true,
			description: "Session event time of this record version."
		},
		currentRevision: {
			type: "integer",
			required: true,
			description: "Revision to pass as expected_revision when revising next."
		},
		authorName: {
			type: "string",
			required: true,
			description: "Server-derived author name."
		},
		title: {
			type: "string",
			required: true
		},
		summary: {
			type: "string",
			required: true
		},
		contentLength: {
			type: "integer",
			required: true
		},
		associations: {
			type: "object",
			additionalProperties: false,
			required: true,
			properties: {
				taskIds: {
					type: "array",
					required: true,
					items: { type: "string" }
				},
				memberSessionIds: {
					type: "array",
					required: true,
					items: { type: "string" }
				}
			}
		},
		references: {
			type: "array",
			required: true,
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					sessionId: {
						type: "string",
						required: true
					},
					seq: {
						type: "integer",
						required: true
					}
				}
			}
		},
		pending: {
			type: "array",
			required: true,
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						type: "string",
						required: true
					},
					text: {
						type: "string",
						required: true
					}
				}
			}
		}
	}
};
/**
* Prove the calling Agent is the exact live Team Lead that owns this tool registration.
* @param ctx - plugin context with Agent and Team services.
* @param installed - Agent whose scope owns the registration.
* @param caller - execution identity from the tool runtime context.
* @returns the authorized Lead and its model-facing name.
* @throws {CollaborationRecordError} when the caller is absent, stale, not the Lead, or not the registration owner.
*/
function authorizeLead(ctx, installed, caller) {
	if (caller === void 0) throw forbiddenError("write_collaboration_record requires a calling Agent; only the Team Lead may write collaboration records.");
	if (ctx.agents.get(caller.id) !== caller) throw forbiddenError("The calling Agent is no longer live; reopen the Lead Session and retry. The collaboration record was not changed.");
	const membership = ctx.agentTeams.tryMembership(caller);
	if (membership?.role !== "lead") throw forbiddenError("Only the Team Lead may write collaboration records; teammates and subagents report facts to the Lead. The collaboration record was not changed.");
	if (membership.root !== caller) throw forbiddenError("The calling Agent is not the root Agent of its Team; only the exact Team Lead may write collaboration records.");
	if (caller !== installed) throw forbiddenError("The calling Agent does not own this collaboration record tool registration. The collaboration record was not changed.");
	return {
		agent: caller,
		authorName: membership.name
	};
}
/** Reject model-supplied author fields; the Host derives the author from the Lead Session. */
function rejectSuppliedAuthor(argumentsValue) {
	if (typeof argumentsValue !== "object" || argumentsValue === null || Array.isArray(argumentsValue)) return;
	for (const key of AUTHOR_ARGUMENT_KEYS) if (Object.hasOwn(argumentsValue, key)) throw argumentError(`The author is derived from the Lead Session and is not an argument; remove "${key}" and retry. The collaboration record was not changed.`);
}
function requireText(field, value, max) {
	const text = value.trim();
	if (text === "") throw argumentError(`${field} must not be blank.`);
	if (text.length > max) throw argumentError(`${field} must be at most ${max} characters; received ${text.length}. The collaboration record was not changed.`);
	return text;
}
/** One limit-capped list of trimmed non-blank ids, preserving first-seen order. */
function uniqueIds(field, values, max) {
	if (values.length > max) throw argumentError(`${field} accepts at most ${max} ids; received ${values.length}.`);
	const seen = /* @__PURE__ */ new Set();
	const result = [];
	for (const value of values) {
		const id = value.trim();
		if (id === "") throw argumentError(`${field} must not contain a blank id.`);
		if (seen.has(id)) continue;
		seen.add(id);
		result.push(id);
	}
	return result;
}
function knownIds(values) {
	if (values.length === 0) return "(none)";
	const shown = values.slice(0, 20);
	return shown.join(", ") + (values.length > shown.length ? `, … (${values.length} total)` : "");
}
/**
* Validate task and member associations against the Lead Team projection.
* @param ctx - plugin context with the Team service.
* @param lead - exact live Team Lead.
* @param raw - model-supplied associations, or undefined.
* @param limits - deployment bounds.
* @returns the recorded associations.
* @throws {CollaborationRecordError} when an id does not exist in the Lead Team state.
*/
function validateAssociations(ctx, lead, raw, limits) {
	const requestedTaskIds = raw?.task_ids ?? [];
	const requestedMemberIds = raw?.member_session_ids ?? [];
	const taskIds = uniqueIds("associations.task_ids", requestedTaskIds, limits.maxAssociations);
	const memberSessionIds = uniqueIds("associations.member_session_ids", requestedMemberIds, limits.maxAssociations);
	if (taskIds.length + memberSessionIds.length > limits.maxAssociations) throw argumentError(`associations accepts at most ${limits.maxAssociations} ids in total; received ${taskIds.length + memberSessionIds.length}.`);
	if (taskIds.length > 0) {
		let tasks;
		try {
			tasks = ctx.agentTeams.listTasks(lead);
		} catch (error) {
			throw new CollaborationRecordError("Cannot validate associations because the Lead Team task board is unavailable. The collaboration record was not changed.", "COLLABORATION_RECORD_ASSOCIATION", { cause: error });
		}
		const known = new Set(tasks.map((task) => String(task.id)));
		const missing = taskIds.filter((id) => !known.has(id));
		if (missing.length > 0) throw associationError(`Unknown Team task id${missing.length === 1 ? "" : "s"} ${missing.map((id) => `"${id}"`).join(", ")}; known task ids: ${knownIds(tasks.map((task) => String(task.id)))}. Association must name existing Team tasks; the collaboration record was not changed.`);
	}
	if (memberSessionIds.length > 0) {
		let members;
		try {
			members = ctx.agentTeams.listMembers(lead);
		} catch (error) {
			throw new CollaborationRecordError("Cannot validate associations because the Lead Team roster is unavailable. The collaboration record was not changed.", "COLLABORATION_RECORD_ASSOCIATION", { cause: error });
		}
		const known = new Set(members.map((member) => String(member.id)));
		const missing = memberSessionIds.filter((id) => !known.has(id));
		if (missing.length > 0) throw associationError(`Unknown Team member Session id${missing.length === 1 ? "" : "s"} ${missing.map((id) => `"${id}"`).join(", ")}; known member ids: ${knownIds(members.map((member) => String(member.id)))}. Association must name existing Team members; the collaboration record was not changed.`);
	}
	return {
		taskIds: taskIds.map((id) => TeamTaskId(id)),
		memberSessionIds: memberSessionIds.map((id) => SessionId(id))
	};
}
/** Whether one Session's log contains one event position. */
function sessionHasSeq(seq, sessionSeq) {
	return seq < sessionSeq;
}
/**
* Validate original-event references against the Lead Session, a live Session, or a Team member Session.
* @param ctx - plugin context with the Session store and Team service.
* @param lead - exact live Team Lead.
* @param raw - model-supplied references, or undefined.
* @param limits - deployment bounds.
* @returns the recorded references.
* @throws {CollaborationRecordError} when a reference is not a real position in a known Session.
*/
function validateReferences(ctx, lead, raw, limits) {
	const references = raw ?? [];
	if (references.length > limits.maxReferences) throw argumentError(`references accepts at most ${limits.maxReferences} entries; received ${references.length}. The collaboration record was not changed.`);
	if (references.length === 0) return [];
	const memberIds = /* @__PURE__ */ new Set();
	let membersLoaded = false;
	const knownMember = (id) => {
		if (!membersLoaded) {
			try {
				for (const member of ctx.agentTeams.listMembers(lead)) memberIds.add(String(member.id));
			} catch (error) {
				throw new CollaborationRecordError("Cannot validate references because the Lead Team roster is unavailable. The collaboration record was not changed.", "COLLABORATION_RECORD_REFERENCE", { cause: error });
			}
			membersLoaded = true;
		}
		return memberIds.has(id);
	};
	const seen = /* @__PURE__ */ new Set();
	const result = [];
	for (const reference of references) {
		const sessionId = reference.session_id.trim();
		if (sessionId === "") throw referenceError("references.session_id must not be blank. The collaboration record was not changed.");
		if (!Number.isSafeInteger(reference.seq) || reference.seq < 0) throw referenceError(`references.seq must be a non-negative safe integer; received ${String(reference.seq)} for Session "${sessionId}". The collaboration record was not changed.`);
		const key = `${sessionId}:${reference.seq}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const branded = SessionId(sessionId);
		if (sessionId === String(lead.session.id)) {
			if (!sessionHasSeq(reference.seq, lead.session.seq)) throw referenceError(`references.seq ${reference.seq} does not exist in the Lead Session (next seq ${lead.session.seq}). The collaboration record was not changed.`);
		} else {
			const live = ctx.sessions.get(branded);
			if (live !== void 0) {
				if (!sessionHasSeq(reference.seq, live.seq)) throw referenceError(`references.seq ${reference.seq} does not exist in Session "${sessionId}" (next seq ${live.seq}). The collaboration record was not changed.`);
			} else if (!knownMember(sessionId)) throw referenceError(`Session "${sessionId}" is not the Lead Session, a live Session, or a Team member Session; references must name a known Session. The collaboration record was not changed.`);
		}
		result.push({
			sessionId: branded,
			seq: reference.seq
		});
	}
	return result;
}
/**
* Build pending items, reusing the stable id of each unchanged item from the previous version.
* @param raw - model-supplied pending items.
* @param previous - pending items of the previous version, empty on create.
* @param limits - deployment bounds.
* @returns pending items carrying stable ids.
*/
function pendingItems(raw, previous, limits) {
	const requested = raw ?? [];
	if (requested.length > limits.maxPending) throw argumentError(`pending accepts at most ${limits.maxPending} items; received ${requested.length}. The collaboration record was not changed.`);
	const reusable = [...previous];
	return requested.map((item) => {
		const text = requireText("pending.text", item.text, limits.maxPendingTextLength);
		const index = reusable.findIndex((candidate) => candidate.text === text);
		if (index >= 0) {
			const reused = reusable.splice(index, 1)[0];
			if (reused !== void 0) return {
				id: reused.id,
				text
			};
		}
		return {
			id: `pending-${randomUUID()}`,
			text
		};
	});
}
/** Read the fold state of the Lead Session that owns this write. */
function recordState(projection, lead) {
	try {
		return projection.stateOf(lead.session);
	} catch (error) {
		throw new CollaborationRecordError("Cannot read the Lead Session collaboration records; the Session is not ready. The collaboration record was not changed.", "COLLABORATION_RECORD_UNAVAILABLE", { cause: error });
	}
}
/**
* Validate, compare the expected revision, and append one whole record version.
* Every step runs in one synchronous span; no `await` may separate the
* revision check from the append.
* @param ctx - plugin context.
* @param lead - authorized exact live Team Lead.
* @param projection - registered collaboration record projection.
* @param limits - deployment bounds.
* @param args - model arguments.
* @param exec - tool execution context carrying the raw arguments.
* @returns the recorded version plus the revision to use when revising next.
*/
function writeRecord(ctx, lead, projection, limits, args, exec) {
	rejectSuppliedAuthor(exec.arguments);
	if (!Number.isSafeInteger(args.expected_revision) || args.expected_revision < 0) throw argumentError(`expected_revision must be a non-negative safe integer; received ${String(args.expected_revision)}. The collaboration record was not changed.`);
	if (args.content.length > limits.maxContentLength) throw argumentError(`content must be at most ${limits.maxContentLength} characters; received ${args.content.length}. The collaboration record was not changed.`);
	const title = requireText("title", args.title, limits.maxTitleLength);
	const summary = requireText("summary", args.summary, limits.maxSummaryLength);
	const associations = validateAssociations(ctx, lead.agent, args.associations, limits);
	const references = validateReferences(ctx, lead.agent, args.references, limits);
	const requestedRecordId = (args.record_id ?? "").trim();
	const state = recordState(projection, lead.agent);
	let recordId;
	let revision;
	let previousPending = [];
	if (requestedRecordId === "") {
		if (args.expected_revision !== 0) throw new CollaborationRecordError(`A new collaboration record requires expected_revision 0; received ${args.expected_revision}. The record was not created; omit record_id to create a record.`, "COLLABORATION_RECORD_CONFLICT");
		recordId = `record-${randomUUID()}`;
		revision = 1;
	} else {
		const current = state.records.find((entry) => entry.recordId === requestedRecordId);
		if (current === void 0) throw new CollaborationRecordError(`Unknown collaboration record "${requestedRecordId}". Omit record_id to create a new record, or pass the record_id from an earlier write_collaboration_record result. The collaboration record was not changed.`, "COLLABORATION_RECORD_NOT_FOUND");
		if (args.expected_revision !== current.latest.revision) throw new CollaborationRecordError(`Collaboration record "${current.recordId}" is at revision ${current.latest.revision} "${current.latest.title}" — ${current.latest.summary} (currentRevision=${current.latest.revision}). Received expected_revision ${args.expected_revision}; history was not changed. Retry with expected_revision ${current.latest.revision}.`, "COLLABORATION_RECORD_CONFLICT");
		recordId = current.recordId;
		revision = current.latest.revision + 1;
		previousPending = current.latest.pending;
	}
	const pending = pendingItems(args.pending, previousPending, limits);
	const version = {
		recordId,
		revision,
		title,
		summary,
		content: args.content,
		associations,
		references,
		pending,
		authorSessionId: lead.agent.session.id,
		authorName: lead.authorName
	};
	appendPluginRecord(lead.agent.session, COLLABORATION_RECORD_TYPE, version);
	const updated = recordState(projection, lead.agent).records.find((entry) => entry.recordId === recordId);
	if (updated === void 0) throw new CollaborationRecordError(`The collaboration record "${recordId}" was written but is not readable from the projection; reopen the Session before retrying.`, "COLLABORATION_RECORD_UNAVAILABLE");
	const latest = updated.latest;
	return {
		recordId,
		revision: latest.revision,
		seq: updated.updatedSeq,
		time: updated.updatedTime,
		currentRevision: latest.revision,
		authorName: latest.authorName,
		title: latest.title,
		summary: latest.summary,
		contentLength: latest.content.length,
		associations: {
			taskIds: latest.associations.taskIds.map((id) => String(id)),
			memberSessionIds: latest.associations.memberSessionIds.map((id) => String(id))
		},
		references: latest.references.map((reference) => ({
			sessionId: String(reference.sessionId),
			seq: reference.seq
		})),
		pending: latest.pending.map((item) => ({
			id: item.id,
			text: item.text
		}))
	};
}
/** Install the Lead policy section and the scoped record tool for one exact live Lead. */
function installLeadTools(lead, ctx, projection, limits) {
	const scoped = lead.ctx;
	const disposers = [];
	const register = (disposer) => {
		disposers.push(disposer);
	};
	try {
		register(scoped.systemPrompt.section({
			name: POLICY_SECTION,
			order: scoped.systemPrompt.getSectionOrder("TEAM_POLICY"),
			text: COLLABORATION_POLICY
		}));
		register(scoped.tools.register(defineTool({
			name: WRITE_RECORD_TOOL,
			description: "Write or revise one collaboration record for this Agent Team. Only the Team Lead can call this tool and the Host derives the author. Omit record_id and pass expected_revision 0 to create a record; to revise, pass the record_id from an earlier result and its current revision as expected_revision. A stale expected_revision returns a conflict naming the currentRevision; retry with that revision instead of writing over history.",
			parameters: {
				record_id: {
					type: "string",
					description: "Existing record id to revise. Omit to create a new record."
				},
				expected_revision: {
					type: "integer",
					required: true,
					description: "0 when creating a record; the current revision when revising one."
				},
				title: {
					type: "string",
					required: true,
					description: "Card title; non-blank, at most 200 characters."
				},
				summary: {
					type: "string",
					required: true,
					description: "Short summary; non-blank, at most 500 characters."
				},
				content: {
					type: "string",
					required: true,
					description: "Long body for the record detail surface; at most 8000 characters."
				},
				associations: {
					type: "object",
					additionalProperties: false,
					description: "Explicit ids that already exist in the Lead Team projection; omit what you cannot verify.",
					properties: {
						task_ids: {
							type: "array",
							items: { type: "string" },
							description: "Existing Team task ids this record reports on."
						},
						member_session_ids: {
							type: "array",
							items: { type: "string" },
							description: "Existing Team member Session ids this record reports on."
						}
					}
				},
				references: {
					type: "array",
					description: "Original events this record reports on, as Session id and event seq.",
					items: {
						type: "object",
						additionalProperties: false,
						properties: {
							session_id: {
								type: "string",
								required: true,
								description: "Session that owns the referenced event."
							},
							seq: {
								type: "integer",
								required: true,
								description: "Zero-based event position in that Session log."
							}
						}
					}
				},
				pending: {
					type: "array",
					description: "Human decisions this record leaves open; the Host assigns stable ids.",
					items: {
						type: "object",
						additionalProperties: false,
						properties: { text: {
							type: "string",
							required: true,
							description: "Decision reserved for a human."
						} }
					}
				}
			},
			output: {
				schema: OUTPUT_SCHEMA,
				render: (_args, value) => [{
					type: "text",
					text: JSON.stringify(value)
				}]
			},
			execute: (args, exec) => Promise.resolve(writeRecord(ctx, authorizeLead(ctx, lead, exec.agent), projection, limits, args, exec))
		})));
	} catch (error) {
		for (const dispose of disposers.reverse()) dispose();
		throw error;
	}
	return () => {
		for (const dispose of disposers.reverse()) dispose();
	};
}
/**
* Register the collaboration record projection and install the record tool in
* every live or subsequently published Team Lead scope.
* @param ctx - plugin context.
* @param config - deployment bounds; direct composition without a config gets the defaults.
*/
async function apply(ctx, config = {}) {
	const limits = resolveLimits(config);
	const projection = await ctx.sessionProjections.register(collaborationRecordsProjection);
	const installed = /* @__PURE__ */ new Map();
	const maybeInstall = (agent) => {
		if (installed.has(agent)) return;
		if (ctx.agents.get(agent.id) !== agent) return;
		if (ctx.agentTeams.tryMembership(agent)?.role !== "lead") return;
		installed.set(agent, installLeadTools(agent, ctx, projection, limits));
	};
	for (const agent of ctx.agents.list()) maybeInstall(agent);
	ctx.on("agent/created", ({ agent }) => {
		maybeInstall(agent);
	});
	ctx.on("agent/disposed", ({ agent }) => {
		installed.get(agent)?.();
		installed.delete(agent);
	});
	ctx.effect(() => () => {
		for (const dispose of installed.values()) dispose();
		installed.clear();
	}, "collaboration-records.leadTools()");
}
//#endregion
export { COLLABORATION_POLICY, CollaborationRecordError, Config, POLICY_SECTION, WRITE_RECORD_TOOL, apply, inject, name };
