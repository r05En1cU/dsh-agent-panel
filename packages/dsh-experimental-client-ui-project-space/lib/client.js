window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-experimental-client-ui-project-space",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region lib/types/client/data/format.js
		/** Deterministic-ish presentation helpers shared by the project-space views. */
		/**
		* Format one durable epoch-millisecond timestamp.
		* @param value - epoch milliseconds as carried by the collaboration-record view.
		* @returns a local date-time string, or null for an unusable value.
		*/
		function formatTimestamp(value) {
			if (!Number.isFinite(value) || value <= 0) return null;
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return null;
			return new Intl.DateTimeFormat(void 0, {
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit"
			}).format(date);
		}
		/**
		* Render a list of durable ids for display; never invents an id.
		* @param ids - explicit ids from a projection.
		* @returns the comma-separated ids.
		*/
		function formatIds(ids) {
			return ids.join(", ");
		}
		//#endregion
		//#region lib/types/client/data/types.js
		/** Fixed identity of the project goal node. */
		const GOAL_NODE_ID = "goal";
		/** Fixed identity of the Lead node. */
		const LEAD_NODE_ID = "lead";
		/** Stable node identity of one Team member. */
		/**
		* Stable node identity of one Team member.
		* @param sessionId - member Session id.
		* @returns the member node id.
		*/
		function memberNodeId(sessionId) {
			return `member:${sessionId}`;
		}
		/** Stable node identity of one shared task. */
		/**
		* Stable node identity of one shared task.
		* @param taskId - durable task id.
		* @returns the task node id.
		*/
		function taskNodeId(taskId) {
			return `task:${taskId}`;
		}
		/** Stable node identity of one collaboration record. */
		/**
		* Stable node identity of one collaboration record.
		* @param recordId - durable record id.
		* @returns the result node id.
		*/
		function resultNodeId(recordId) {
			return `result:${recordId}`;
		}
		/** Translation of one member projection plus live activity into a runtime state. */
		/**
		* Translate one member projection plus live activity into a runtime state.
		* @param phase - durable lifecycle phase from the Team projection.
		* @param running - live Session running fact, or undefined before a baseline.
		* @returns the explicit runtime state; no live fact maps to unknown, never idle.
		*/
		function memberRuntime(phase, running) {
			if (phase === "provisioning") return "provisioning";
			if (phase === "failed") return "failed";
			if (running === true) return "running";
			if (running === false) return "inactive";
			return "unknown";
		}
		/**
		* Resolve a task's durable owner name against the roster. Names are immutable
		* and unique inside a Team; a duplicate name is ambiguous, so no edge is drawn.
		* @param task - shared task view.
		* @param members - current roster projections including the Lead.
		* @returns the unique matching member, or the unresolved state.
		*/
		function resolveTaskOwner(task, members) {
			const ownerName = task.ownerName ?? null;
			if (ownerName === null) return {
				state: "unassigned",
				member: null
			};
			const matches = members.filter((member) => member.name === ownerName);
			const [only] = matches;
			if (matches.length === 1 && only !== void 0) return {
				state: "assigned",
				member: only
			};
			return {
				state: "ambiguous",
				member: null
			};
		}
		//#endregion
		//#region lib/types/client/data/adapt.js
		/** Empty counters for a view with no ready Team data. */
		const EMPTY_COUNTS = {
			members: 0,
			tasks: 0,
			results: 0,
			pending: 0
		};
		/** One view with no project data and an explicit availability phase. */
		function absentModel(phase, errorMessage) {
			return {
				phase,
				errorMessage,
				goal: null,
				lead: null,
				members: [],
				tasks: [],
				results: [],
				edges: [],
				attention: [],
				recordsAvailable: false,
				counts: EMPTY_COUNTS
			};
		}
		/** The native Goal projection folded into the goal node. */
		function goalNode(goal) {
			if (goal === void 0 || goal === null) return {
				kind: "goal",
				id: GOAL_NODE_ID,
				goalState: goal === void 0 ? "projection-missing" : "unset",
				objective: null,
				phase: null,
				roundsStarted: null,
				maxGoalRounds: null,
				revision: null
			};
			return {
				kind: "goal",
				id: GOAL_NODE_ID,
				goalState: "set",
				objective: goal.goal.objective,
				phase: goal.goal.phase,
				roundsStarted: goal.roundsStarted,
				maxGoalRounds: goal.goal.maxGoalRounds,
				revision: goal.goal.revision
			};
		}
		/** One historical record version with only the fields the viewer renders. */
		function resultVersion(version) {
			return {
				revision: version.revision,
				seq: version.seq,
				time: version.time,
				title: version.title,
				summary: version.summary,
				content: version.content,
				taskIds: [...version.associations.taskIds],
				memberSessionIds: [...version.associations.memberSessionIds],
				pending: version.pending.map((item) => ({
					id: item.id,
					text: item.text
				})),
				references: version.references.map((reference) => ({
					sessionId: reference.sessionId,
					seq: reference.seq
				}))
			};
		}
		/** One collaboration record folded into a result node. */
		function resultNode(record) {
			const taskIds = [...record.associations.taskIds];
			const memberSessionIds = [...record.associations.memberSessionIds];
			const pending = record.pending.map((item) => ({
				id: item.id,
				text: item.text
			}));
			const references = record.references.map((reference) => ({
				sessionId: reference.sessionId,
				seq: reference.seq
			}));
			return {
				kind: "result",
				id: resultNodeId(record.recordId),
				recordId: record.recordId,
				revision: record.revision,
				title: record.title,
				summary: record.summary,
				content: record.content,
				authorName: record.authorName,
				updatedTime: record.updatedTime,
				updatedSeq: record.updatedSeq,
				taskIds,
				memberSessionIds,
				pending,
				references,
				pendingCount: pending.length,
				associationsProvided: taskIds.length > 0 || memberSessionIds.length > 0,
				versions: record.versions.map(resultVersion)
			};
		}
		/** Resolve one member projection into its member node. */
		function memberNode(member, input, taskCount) {
			return {
				kind: "member",
				id: memberNodeId(member.id),
				sessionId: member.id,
				name: member.name,
				lifecycle: member.phase,
				runtime: memberRuntime(member.phase, input.liveRunning[member.id]),
				taskCount,
				pendingCount: 0
			};
		}
		/** Resolve one shared task into its task node. */
		function taskNode(task, team, pendingCount) {
			const owner = resolveTaskOwner(task, team.members);
			return {
				kind: "task",
				id: taskNodeId(task.id),
				taskId: task.id,
				revision: task.revision,
				subject: task.subject,
				description: task.description,
				status: task.status,
				ready: task.ready,
				blockedBy: [...task.blockedBy],
				writeScopes: [...task.writeScopes],
				ownerName: task.ownerName ?? null,
				ownerMemberId: owner.member === null ? null : memberNodeId(owner.member.id),
				ownerState: owner.state,
				pendingCount
			};
		}
		/** Build the ready-phase model from real projections. */
		function readyModel(input, team) {
			const goal = goalNode(input.goal);
			const leadMember = team.members.find((member) => member.role === "lead");
			const lead = leadMember === void 0 ? null : {
				kind: "lead",
				id: LEAD_NODE_ID,
				sessionId: leadMember.id,
				name: leadMember.name,
				lifecycle: leadMember.phase,
				runtime: memberRuntime(leadMember.phase, input.liveRunning[leadMember.id])
			};
			const teammateMembers = team.members.filter((member) => member.role === "teammate");
			const results = input.records === void 0 ? [] : input.records.records.map((record) => resultNode(record));
			const resultById = new Map(results.map((result) => [result.recordId, result]));
			const taskOwners = /* @__PURE__ */ new Map();
			for (const task of team.tasks) {
				const owner = resolveTaskOwner(task, team.members);
				taskOwners.set(task.id, owner.member === null ? null : memberNodeId(owner.member.id));
			}
			const pendingOf = (recordId) => resultById.get(recordId)?.pendingCount ?? 0;
			const tasks = team.tasks.map((task) => {
				return taskNode(task, team, results.reduce((count, result) => result.taskIds.includes(task.id) ? count + pendingOf(result.recordId) : count, 0));
			});
			const taskById = new Map(tasks.map((task) => [task.taskId, task]));
			const members = teammateMembers.map((member) => {
				const id = memberNodeId(member.id);
				const ownedTasks = tasks.filter((task) => task.ownerMemberId === id);
				const bridgeTaskIds = new Set(ownedTasks.map((task) => task.taskId));
				const pendingCount = results.reduce((count, result) => {
					const viaMember = result.memberSessionIds.some((sessionId) => memberNodeId(sessionId) === id);
					const viaTask = result.taskIds.some((taskId) => bridgeTaskIds.has(taskId));
					return viaMember || viaTask ? count + result.pendingCount : count;
				}, 0);
				return {
					...memberNode(member, input, ownedTasks.length),
					pendingCount
				};
			});
			const memberById = new Map(members.map((member) => [member.id, member]));
			const edges = [];
			if (lead !== null) edges.push({
				id: "edge:goal-lead",
				kind: "goal-lead",
				from: GOAL_NODE_ID,
				to: LEAD_NODE_ID
			});
			for (const member of members) {
				if (lead === null) break;
				edges.push({
					id: `edge:delegate:${member.id}`,
					kind: "delegate",
					from: LEAD_NODE_ID,
					to: member.id
				});
			}
			for (const task of tasks) {
				if (task.ownerMemberId === null) continue;
				edges.push({
					id: `edge:task:${task.id}`,
					kind: "task",
					from: task.ownerMemberId,
					to: task.id
				});
			}
			for (const result of results) {
				for (const taskId of result.taskIds) {
					const task = taskById.get(taskId);
					if (task === void 0) continue;
					edges.push({
						id: `edge:result:${result.recordId}:task:${taskId}`,
						kind: "result",
						from: task.id,
						to: result.id
					});
				}
				for (const sessionId of result.memberSessionIds) {
					const member = memberById.get(memberNodeId(sessionId));
					if (member === void 0) continue;
					if (result.taskIds.some((taskId) => {
						const task = taskById.get(taskId);
						return task !== void 0 && task.ownerMemberId === member.id;
					})) continue;
					edges.push({
						id: `edge:member-result:${result.recordId}:${member.sessionId}`,
						kind: "member-result",
						from: member.id,
						to: result.id
					});
				}
			}
			const attention = [];
			for (const result of results) for (const pending of result.pending) attention.push({
				id: `attention:${result.recordId}:${pending.id}`,
				recordId: result.recordId,
				recordNodeId: result.id,
				recordTitle: result.title,
				recordRevision: result.revision,
				pendingId: pending.id,
				text: pending.text,
				taskIds: result.taskIds,
				memberSessionIds: result.memberSessionIds
			});
			return {
				phase: "ready",
				errorMessage: null,
				goal,
				lead,
				members,
				tasks,
				results,
				edges,
				attention,
				recordsAvailable: input.records !== void 0,
				counts: {
					members: members.length,
					tasks: tasks.length,
					results: results.length,
					pending: attention.length
				}
			};
		}
		/**
		* Fold the Lead Session's real projections into one project-space model.
		* @param input - validated projection values plus live Session activity flags.
		* @returns the model for both conversation views; no sample data is invented.
		*/
		function buildProjectSpace(input) {
			if (input.teamState === "loading") return absentModel("loading", null);
			if (input.teamState === "error") return absentModel("error", input.teamErrorMessage);
			if (input.teamState === "absent" || input.team === void 0) return absentModel("team-absent", null);
			return readyModel(input, input.team);
		}
		/**
		* Explicit node and edge ids relevant to one selection.
		* @param model - current project-space model.
		* @param selectedId - selected node id, edge id, or null.
		* @returns the node ids and edge ids the selection highlights.
		*/
		function selectionPath(model, selectedId) {
			const nodeIds = /* @__PURE__ */ new Set();
			const edgeIds = /* @__PURE__ */ new Set();
			if (model.phase !== "ready" || selectedId === null) return {
				nodeIds,
				edgeIds
			};
			const nodeById = /* @__PURE__ */ new Map();
			nodeById.set(GOAL_NODE_ID, "goal");
			nodeById.set(LEAD_NODE_ID, "lead");
			for (const member of model.members) nodeById.set(member.id, "member");
			for (const task of model.tasks) nodeById.set(task.id, "task");
			for (const result of model.results) nodeById.set(result.id, "result");
			const edgesOf = (nodeId) => model.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
			const roots = () => {
				nodeIds.add(GOAL_NODE_ID);
				nodeIds.add(LEAD_NODE_ID);
				for (const edge of model.edges) if (edge.kind === "goal-lead" || edge.kind === "delegate") {
					nodeIds.add(edge.from);
					nodeIds.add(edge.to);
					edgeIds.add(edge.id);
				}
			};
			const memberChain = (memberId) => {
				nodeIds.add(memberId);
				nodeIds.add(LEAD_NODE_ID);
				nodeIds.add(GOAL_NODE_ID);
				for (const edge of model.edges) if (edge.kind === "goal-lead" || edge.kind === "delegate" && (edge.to === memberId || edge.from === "lead")) {
					nodeIds.add(edge.from);
					nodeIds.add(edge.to);
					edgeIds.add(edge.id);
				}
			};
			if (selectedId.startsWith("edge:")) {
				const edge = model.edges.find((candidate) => candidate.id === selectedId);
				if (edge === void 0) return {
					nodeIds,
					edgeIds
				};
				edgeIds.add(edge.id);
				nodeIds.add(edge.from);
				nodeIds.add(edge.to);
				return {
					nodeIds,
					edgeIds
				};
			}
			const kind = nodeById.get(selectedId);
			if (kind === void 0) return {
				nodeIds,
				edgeIds
			};
			nodeIds.add(selectedId);
			switch (kind) {
				case "goal":
				case "lead":
					roots();
					break;
				case "member":
					memberChain(selectedId);
					for (const edge of edgesOf(selectedId)) {
						if (edge.kind === "delegate") continue;
						nodeIds.add(edge.from);
						nodeIds.add(edge.to);
						edgeIds.add(edge.id);
					}
					for (const result of model.results) {
						if (!result.memberSessionIds.some((sessionId) => memberNodeId(sessionId) === selectedId)) continue;
						nodeIds.add(result.id);
						for (const edge of edgesOf(result.id)) {
							if (edge.to !== result.id) continue;
							nodeIds.add(edge.from);
							nodeIds.add(edge.to);
							edgeIds.add(edge.id);
						}
					}
					break;
				case "task": {
					const taskId = selectedId.slice(5);
					const task = model.tasks.find((candidate) => candidate.id === selectedId);
					if (task?.ownerMemberId !== null && task !== void 0) memberChain(task.ownerMemberId);
					for (const result of model.results) {
						if (!result.taskIds.includes(taskId)) continue;
						nodeIds.add(result.id);
						for (const edge of edgesOf(result.id)) {
							if (edge.from !== selectedId && edge.to !== selectedId) continue;
							edgeIds.add(edge.id);
						}
						for (const edge of edgesOf(result.id)) {
							if (edge.kind !== "result") continue;
							if (!result.taskIds.includes(edge.from.slice(5))) continue;
							nodeIds.add(edge.from);
							nodeIds.add(edge.to);
							edgeIds.add(edge.id);
						}
					}
					break;
				}
				case "result": {
					const result = model.results.find((candidate) => candidate.id === selectedId);
					if (result === void 0) break;
					for (const edge of model.edges) {
						if (edge.to !== selectedId) continue;
						if (edge.kind === "result" || edge.kind === "member-result") {
							nodeIds.add(edge.from);
							nodeIds.add(edge.to);
							edgeIds.add(edge.id);
						}
					}
					for (const task of model.tasks) {
						if (!result.taskIds.includes(task.taskId)) continue;
						nodeIds.add(task.id);
						for (const edge of model.edges) if (edge.kind === "task" && edge.to === task.id) {
							nodeIds.add(edge.from);
							nodeIds.add(edge.to);
							edgeIds.add(edge.id);
						}
						if (task.ownerMemberId !== null) memberChain(task.ownerMemberId);
					}
					for (const sessionId of result.memberSessionIds) {
						const member = model.members.find((candidate) => candidate.sessionId === sessionId);
						if (member === void 0) continue;
						memberChain(member.id);
						for (const edge of model.edges) if (edge.kind === "member-result" && edge.from === member.id && edge.to === selectedId) edgeIds.add(edge.id);
					}
					break;
				}
			}
			return {
				nodeIds,
				edgeIds
			};
		}
		//#endregion
		//#region lib/types/client/model.js
		/**
		* Framework-hook composition: read the Lead Session's real projections and
		* live Session activity, then fold them through the pure adapter. Projects
		* never enter this module; it only reads the two status sources and the three
		* projection keys the contract names.
		*/
		/** Lead Session id for a conversation: the current Session, or its addressed parent. */
		function leadSessionOf(sessionId, parentSessionId) {
			return parentSessionId ?? sessionId;
		}
		/**
		* Compose the project-space model from framework hooks.
		* @param props - the conversation view's standard hooks and current Session id.
		* @returns the pure model both project-space views render.
		*/
		function useProjectSpaceModel(props) {
			const { sessionId, useSession, useProjection, useSessions, useSessionStatus } = props;
			const leadSessionId = leadSessionOf(sessionId, useSession((snapshot) => snapshot.subagent?.address.parentSessionId));
			const isLeadSession = leadSessionId === sessionId;
			const sessionTeam = useProjection("agentTeam");
			const sessionRecords = useProjection("collaborationRecords");
			const sessionGoal = useProjection("goal");
			const leadProjection = useSessions((state) => state.projectionsBySession[leadSessionId]);
			const listPhase = useSessions((state) => state.phase);
			const listRunning = useSessions((state) => state.byId);
			const openState = useSession((state) => state.openState);
			const statuses = useSessionStatus((state) => state);
			const team = isLeadSession ? sessionTeam : leadProjection?.values.agentTeam;
			const records = isLeadSession ? sessionRecords : leadProjection?.values.collaborationRecords;
			const goal = isLeadSession ? sessionGoal : leadProjection?.values.goal;
			const projectionState = leadProjection?.state;
			const projectionError = leadProjection?.error?.message ?? null;
			const teamState = team !== void 0 ? "ready" : openState === "loading" || listPhase === "pending" || projectionState === "loading" || projectionState === "idle" || !isLeadSession && leadProjection === void 0 ? "loading" : projectionState === "error" ? "error" : "absent";
			const liveRunning = (0, react.useMemo)(() => {
				const running = {};
				for (const member of team?.members ?? []) running[member.id] = statuses.get(member.id)?.running ?? listRunning[member.id]?.running;
				return running;
			}, [
				team,
				statuses,
				listRunning
			]);
			return (0, react.useMemo)(() => buildProjectSpace({
				leadSessionId,
				teamState,
				teamErrorMessage: teamState === "error" ? projectionError : null,
				team,
				goal,
				records,
				liveRunning
			}), [
				goal,
				leadSessionId,
				liveRunning,
				records,
				team,
				teamState,
				projectionError
			]);
		}
		//#endregion
		//#region lib/types/client/cx.js
		/**
		* Join present CSS-module class names without a third-party helper.
		* @param names - class names, with absent branches as false/null/undefined.
		* @returns the space-joined class names.
		*/
		function cx(...names) {
			return names.filter((name) => typeof name === "string" && name.length > 0).join(" ");
		}
		//#endregion
		//#region \0dsh-css:D:\dsh-upstream\packages\experimental\client-ui-project-space\src\client\project-space.module.css.mjs
		const css$1 = ".YWx12G_root,.YWx12G_summaryRoot{--ps-canvas-bg:var(--dsw-alias-bg-base);--ps-card-bg:var(--dsw-alias-bg-layer-1);--ps-card-raised:var(--dsw-alias-bg-layer-2);--ps-ink:var(--dsw-alias-label-primary);--ps-ink-secondary:var(--dsw-alias-label-secondary);--ps-ink-tertiary:var(--dsw-alias-label-tertiary);--ps-line:var(--dsw-alias-border-l2);--ps-line-strong:var(--dsw-alias-border-l3);--ps-line-soft:var(--dsw-alias-border-l1);--ps-blue:var(--dsw-alias-state-business-primary);--ps-blue-ink:var(--dsw-alias-label-primary-foreground);--ps-blue-soft:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, var(--dsw-alias-bg-layer-1));--ps-hover:var(--dsw-alias-interactive-bg-hover);--ps-shadow:var(--dsw-shadow-lv2);--ps-dot:var(--dsw-alias-border-l2);--ps-selected:var(--dsw-alias-label-primary);--ps-muted-surface:var(--dsw-alias-bg-layer-2);box-sizing:border-box;width:100%;min-width:0;height:100%;min-height:0;color:var(--ps-ink);background:var(--ps-canvas-bg);padding-bottom:calc(var(--dsh-composer-height,152px) + 8px);isolation:isolate;flex-direction:column;font-size:13px;line-height:1.5;display:flex;overflow:hidden}body[data-ds-dark-theme] .YWx12G_root,body[data-ds-dark-theme] .YWx12G_summaryRoot{--ps-canvas-bg:var(--dsw-alias-bg-base);--ps-card-bg:var(--dsw-alias-bg-layer-2);--ps-card-raised:var(--dsw-alias-bg-layer-3);--ps-ink:var(--dsw-alias-label-primary);--ps-ink-secondary:var(--dsw-alias-label-secondary);--ps-ink-tertiary:var(--dsw-alias-label-tertiary);--ps-line:var(--dsw-alias-border-l2);--ps-line-strong:var(--dsw-alias-border-l3);--ps-line-soft:var(--dsw-alias-border-l1);--ps-blue:var(--dsw-alias-state-business-primary);--ps-blue-ink:var(--dsw-alias-label-primary-foreground);--ps-blue-soft:color-mix(in srgb, var(--dsw-alias-state-business-primary) 24%, var(--dsw-alias-bg-layer-2));--ps-hover:var(--dsw-alias-interactive-bg-hover);--ps-shadow:var(--dsw-shadow-lv3);--ps-dot:var(--dsw-alias-border-l2);--ps-selected:var(--dsw-alias-label-primary);--ps-muted-surface:var(--dsw-alias-bg-layer-3)}.YWx12G_topbar{box-sizing:border-box;flex-wrap:wrap;align-items:center;gap:12px;min-height:38px;padding:4px 12px;display:flex}.YWx12G_goalSummary{flex:240px;align-items:baseline;gap:8px;min-width:0;display:flex}.YWx12G_topbarKicker{color:var(--ps-ink-tertiary);white-space:nowrap;font-size:13px}.YWx12G_goalText{color:var(--ps-ink);text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:13px;font-weight:600;overflow:hidden}.YWx12G_goalMeta{color:var(--ps-ink-secondary);white-space:nowrap;font-size:13px}.YWx12G_counts{flex-wrap:wrap;align-items:center;gap:6px;display:flex}.YWx12G_countChip,.YWx12G_pendingChip{border:1px solid var(--ps-line);border-radius:var(--dsw-radius-sm);background:var(--ps-card-bg);color:var(--ps-ink-secondary);white-space:nowrap;padding:1px 8px;font-size:13px}.YWx12G_pendingChip{border-color:var(--ps-blue);color:var(--ps-blue);background:var(--ps-blue-soft);font-weight:600}.YWx12G_toolbar{flex-wrap:wrap;align-items:center;gap:4px;display:flex}.YWx12G_toolButton{border:1px solid var(--ps-line);border-radius:var(--dsw-radius-sm);background:var(--ps-card-bg);color:var(--ps-ink-secondary);font:inherit;cursor:pointer;padding:3px 9px;font-size:13px}@media (hover:hover){.YWx12G_toolButton:hover{background:var(--ps-hover);color:var(--ps-ink)}}.YWx12G_toolButtonActive{border-color:var(--ps-blue);color:var(--ps-blue)}.YWx12G_shortcutHint{color:var(--ps-ink-tertiary);margin:0;padding:0 12px 4px;font-size:13px}.YWx12G_workspace{flex:auto;gap:0;min-width:0;min-height:0;display:flex}.YWx12G_mainColumn{box-sizing:border-box;flex-direction:column;flex:auto;gap:8px;min-width:0;min-height:0;padding:0 12px 8px;display:flex;overflow:hidden}.YWx12G_stateNotice{border:1px dashed var(--ps-line-strong);border-radius:var(--dsw-radius-lg);background:var(--ps-card-bg);text-align:center;flex-direction:column;flex:auto;justify-content:center;align-items:center;gap:8px;min-height:320px;padding:24px;display:flex}.YWx12G_stateTitle{color:var(--ps-ink);overflow-wrap:anywhere;max-width:52ch;margin:0;font-size:15px;font-weight:600}.YWx12G_stateBody{color:var(--ps-ink-secondary);overflow-wrap:anywhere;max-width:62ch;margin:0;font-size:13px}.YWx12G_recordsNotice{color:var(--ps-ink-secondary);margin:0;padding:2px 2px 0;font-size:13px}.YWx12G_canvasFrameWithDetail{flex:auto}.YWx12G_canvasFrame{border:1px solid var(--ps-line);border-radius:var(--dsw-radius-lg);background:var(--ps-canvas-bg);touch-action:none;flex:auto;min-height:220px;position:relative;overflow:hidden}.YWx12G_canvas{cursor:grab;outline:none;width:100%;height:100%;display:block}.YWx12G_canvas:active{cursor:grabbing}.YWx12G_canvasBackground{fill:var(--ps-canvas-bg)}.YWx12G_canvasDot{fill:var(--ps-dot)}.YWx12G_node{cursor:pointer}.YWx12G_nodeDimmed{opacity:.38}.YWx12G_nodeCard{fill:var(--ps-card-bg);stroke:var(--ps-line-strong);stroke-width:1.2px}.YWx12G_nodeHighlighted{stroke:var(--ps-line-strong)}.YWx12G_nodeSelectedRing{fill:none;stroke:var(--ps-selected);stroke-width:2.4px}.YWx12G_node_goal{stroke:var(--ps-line-strong);stroke-width:1.6px}.YWx12G_node_lead,.YWx12G_node_member{stroke:var(--ps-line-strong)}.YWx12G_node_task{stroke:var(--ps-line)}.YWx12G_node_result{stroke:var(--ps-line-strong);stroke-width:1.4px}.YWx12G_nodeAttentionLine,.YWx12G_nodeAttentionBadge{fill:var(--ps-blue)}.YWx12G_nodeAttentionBadgeText{fill:var(--ps-blue-ink);font-size:12px;font-weight:700}.YWx12G_nodeKicker{fill:var(--ps-ink-tertiary);font-size:12px;font-weight:500}.YWx12G_nodeTitle{fill:var(--ps-ink);font-size:14px;font-weight:600}.YWx12G_nodeMeta{fill:var(--ps-ink-secondary);font-size:12px}.YWx12G_edge{stroke:var(--ps-line-strong);stroke-width:1.6px}.YWx12G_edge_goal-lead,.YWx12G_edge_delegate{stroke:var(--ps-ink-tertiary);stroke-width:1.8px}.YWx12G_edge_result,.YWx12G_edge_member-result{stroke-dasharray:5 4}.YWx12G_edgeDimmed{opacity:.28}.YWx12G_edgeHigher,.YWx12G_edgeHighlighted{stroke:var(--ps-blue);stroke-width:2.4px}.YWx12G_edgeHit{stroke:#0000;stroke-width:14px;cursor:pointer;pointer-events:stroke}.YWx12G_edgeArrow{fill:var(--ps-line-strong)}.YWx12G_edgeArrow.YWx12G_edgeHighlighted{fill:var(--ps-blue)}.YWx12G_edgeLabel{pointer-events:none}.YWx12G_edgeLabelBackground{fill:var(--ps-card-bg);stroke:var(--ps-line);stroke-width:1px}.YWx12G_edgeLabelText{fill:var(--ps-ink-secondary);font-size:12px;font-weight:500}.YWx12G_edgeLabelDimmed{opacity:.3}.YWx12G_attention{border:1px solid var(--ps-line);border-top:3px solid var(--ps-blue);border-radius:var(--dsw-radius-md);background:var(--ps-card-bg);flex-direction:column;flex:none;gap:6px;min-width:0;padding:8px 10px;display:flex}.YWx12G_attentionClear{border-top-color:var(--ps-line-strong)}.YWx12G_attentionHead{flex-wrap:wrap;align-items:center;gap:8px;min-width:0;display:flex}.YWx12G_attentionDot{background:var(--ps-blue);border-radius:2px;flex:none;width:8px;height:8px}.YWx12G_attentionClear .YWx12G_attentionDot{background:var(--ps-line-strong)}.YWx12G_attentionTitle{color:var(--ps-ink);white-space:nowrap;font-size:13px;font-weight:600}.YWx12G_attentionCount{border-radius:var(--dsw-radius-xs);background:var(--ps-blue);color:var(--ps-blue-ink);white-space:nowrap;padding:1px 7px;font-size:12px;font-weight:700;display:inline-block}.YWx12G_attentionCountClear{background:var(--ps-line);color:var(--ps-ink-secondary)}.YWx12G_attentionHint{color:var(--ps-ink-tertiary);overflow-wrap:anywhere;min-width:0;font-size:13px}.YWx12G_attentionItems{flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none;display:flex}.YWx12G_attentionItem{border:1px solid var(--ps-line-strong);border-left:4px solid var(--ps-blue);border-radius:var(--dsw-radius-sm);background:var(--ps-card-bg);max-width:100%;color:var(--ps-ink);font:inherit;text-align:left;cursor:pointer;flex-direction:column;align-items:flex-start;gap:1px;padding:4px 9px;font-size:13px;display:flex}@media (hover:hover){.YWx12G_attentionItem:hover{background:var(--ps-hover)}}.YWx12G_attentionItemText{overflow-wrap:anywhere}.YWx12G_attentionItemMeta{color:var(--ps-ink-secondary);overflow-wrap:anywhere;font-size:12px}.YWx12G_attentionEmpty{color:var(--ps-ink-secondary);margin:0;font-size:13px}.YWx12G_detail{border-left:1px solid var(--ps-line);background:var(--ps-card-bg);width:320px;min-width:0;max-width:100%;box-shadow:var(--ps-shadow);box-sizing:border-box;flex-direction:column;flex:0 0 320px;display:flex}.YWx12G_detailHead{border-bottom:1px solid var(--ps-line);flex:none;justify-content:space-between;align-items:center;gap:8px;padding:8px 12px;display:flex}.YWx12G_detailHeading{color:var(--ps-ink);margin:0;font-size:14px}.YWx12G_detailClose{border:1px solid var(--ps-line);border-radius:var(--dsw-radius-sm);background:var(--ps-card-bg);color:var(--ps-ink-secondary);font:inherit;cursor:pointer;padding:2px 8px;font-size:16px;line-height:1}@media (hover:hover){.YWx12G_detailClose:hover{background:var(--ps-hover);color:var(--ps-ink)}}.YWx12G_detailBody{flex-direction:column;flex:auto;gap:8px;min-height:0;padding:10px 12px 20px;display:flex;overflow:hidden auto}.YWx12G_detailKicker{color:var(--ps-ink-tertiary);margin:0;font-size:12px}.YWx12G_detailTitle{color:var(--ps-ink);overflow-wrap:anywhere;margin:0;font-size:15px;font-weight:600}.YWx12G_detailText{color:var(--ps-ink-secondary);overflow-wrap:anywhere;white-space:pre-wrap;margin:0;font-size:13px}.YWx12G_fields{flex-direction:column;gap:4px;margin:0;display:flex}.YWx12G_field{gap:8px;min-width:0;display:flex}.YWx12G_fieldLabel{color:var(--ps-ink-tertiary);flex:0 0 84px;font-size:13px}.YWx12G_fieldValue{min-width:0;color:var(--ps-ink);overflow-wrap:anywhere;margin:0;font-size:13px}.YWx12G_hint{color:var(--ps-ink-tertiary);overflow-wrap:anywhere;margin:0;font-size:13px}.YWx12G_mutedText{color:var(--ps-ink-secondary);overflow-wrap:anywhere;margin:0;font-size:13px}.YWx12G_sectionHeading{color:var(--ps-ink);border-bottom:1px solid var(--ps-line);margin:6px 0 0;padding-bottom:2px;font-size:13px;font-weight:600}.YWx12G_linkList{flex-wrap:wrap;gap:4px;margin:0;padding:0;list-style:none;display:flex}.YWx12G_nodeLink{border:1px solid var(--ps-line);border-radius:var(--dsw-radius-sm);background:var(--ps-card-raised);color:var(--ps-ink);font:inherit;cursor:pointer;text-align:left;overflow-wrap:anywhere;padding:2px 8px;font-size:13px}@media (hover:hover){.YWx12G_nodeLink:hover{background:var(--ps-hover)}}.YWx12G_pendingList{flex-direction:column;gap:3px;margin:0;padding-left:18px;display:flex}.YWx12G_pendingItem{color:var(--ps-ink);border-left:3px solid var(--ps-blue);background:var(--ps-blue-soft);border-radius:var(--dsw-radius-xs);overflow-wrap:anywhere;padding:3px 7px;font-size:13px;list-style:none}.YWx12G_versionList{flex-direction:column;gap:4px;margin:0;padding:0;list-style:none;display:flex}.YWx12G_versionEntry{border:1px solid var(--ps-line);border-radius:var(--dsw-radius-sm);color:var(--ps-ink);overflow-wrap:anywhere;flex-direction:column;gap:1px;padding:4px 8px;font-size:13px;display:flex}.YWx12G_versionCurrent{border-color:var(--ps-blue)}.YWx12G_versionMeta{color:var(--ps-ink-secondary);font-size:12px}.YWx12G_notice{border:1px solid var(--ps-blue);border-radius:var(--dsw-radius-sm);background:var(--ps-blue-soft);color:var(--ps-ink);overflow-wrap:anywhere;border-left-width:4px;margin:0;padding:5px 9px;font-size:13px}.YWx12G_referenceList{flex-direction:column;gap:4px;margin:0;padding:0;list-style:none;display:flex}.YWx12G_referenceButton{border:1px solid var(--ps-line);border-radius:var(--dsw-radius-sm);background:var(--ps-card-raised);width:100%;color:var(--ps-ink);font:inherit;cursor:pointer;text-align:left;flex-direction:column;align-items:flex-start;gap:1px;padding:4px 8px;font-size:13px;display:flex}@media (hover:hover){.YWx12G_referenceButton:hover{background:var(--ps-hover);border-color:var(--ps-blue)}}.YWx12G_referenceMeta{color:var(--ps-ink-secondary);overflow-wrap:anywhere;font-size:12px}.YWx12G_summaryRoot{padding:4px 12px calc(var(--dsh-composer-height,152px) + 16px);background:var(--ps-canvas-bg);overflow-y:auto}.YWx12G_summaryHeader{flex:none;padding:2px 0 10px}.YWx12G_summaryTitle{color:var(--ps-ink);margin:0;font-size:18px}.YWx12G_summarySubtitle{color:var(--ps-ink-secondary);margin:2px 0 0;font-size:13px}.YWx12G_summaryGrid{grid-template-columns:repeat(auto-fit,minmax(280px,1fr));align-items:start;gap:12px;display:grid}.YWx12G_summaryCard{border:1px solid var(--ps-line);border-radius:var(--dsw-radius-lg);background:var(--ps-card-bg);min-width:0;padding:12px}.YWx12G_summaryCardWide{grid-column:1/-1}.YWx12G_summarySectionTitle{color:var(--ps-ink);flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 8px;font-size:14px;display:flex}.YWx12G_summaryGoal{color:var(--ps-ink);overflow-wrap:anywhere;margin:0;font-size:14px;font-weight:600}.YWx12G_summaryMeta{color:var(--ps-ink-secondary);overflow-wrap:anywhere;margin:2px 0 0;font-size:13px}.YWx12G_summaryList{flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;display:flex}.YWx12G_summaryRow{border-bottom:1px solid var(--ps-line-soft);flex-direction:column;gap:1px;padding-bottom:4px;display:flex}.YWx12G_summaryLink{color:var(--ps-ink);font:inherit;text-align:left;cursor:pointer;overflow-wrap:anywhere;background:0 0;border:0;padding:0;font-size:13px;font-weight:600}@media (hover:hover){.YWx12G_summaryLink:hover{color:var(--ps-blue);text-decoration:underline}}.YWx12G_summaryBody{color:var(--ps-ink-secondary);overflow-wrap:anywhere;margin:2px 0;font-size:13px}.YWx12G_summaryRecord{border:1px solid var(--ps-line);border-radius:var(--dsw-radius-md);flex-direction:column;gap:3px;padding:8px 10px;display:flex}.YWx12G_summaryRecordHead{flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px;display:flex}.YWx12G_summaryReference{margin-top:2px}@media (width<=1100px){.YWx12G_detail{flex-basis:280px;width:280px}}@media (width<=900px){.YWx12G_topbar{gap:8px}.YWx12G_shortcutHint{display:none}.YWx12G_workspace{position:relative}.YWx12G_detail{z-index:3;border:1px solid var(--ps-line);border-radius:var(--dsw-radius-lg);background:var(--ps-card-bg);width:min(340px,100vw - 40px);max-width:100%;position:absolute;top:0;bottom:8px;right:12px}.YWx12G_canvasFrame{min-height:220px}}@media (width<=768px){.YWx12G_root,.YWx12G_summaryRoot{font-size:13px}.YWx12G_mainColumn{padding:0 8px 8px}.YWx12G_summaryRoot{padding:4px 8px 14px}.YWx12G_summaryGrid{grid-template-columns:minmax(0,1fr)}.YWx12G_goalSummary{flex-basis:100%}.YWx12G_countChip,.YWx12G_pendingChip{font-size:13px}.YWx12G_canvasFrame{min-height:200px}.YWx12G_detail{width:min(320px,100vw - 24px);right:8px}}@media (width<=480px){.YWx12G_canvasFrame{min-height:180px}}.YWx12G_headerAction{--ha-ink:var(--dsw-alias-label-primary);--ha-ink-secondary:var(--dsw-alias-label-secondary);--ha-blue:var(--dsw-alias-state-business-primary);--ha-blue-ink:var(--dsw-alias-label-primary-foreground);--ha-line:var(--dsw-alias-border-l2);--ha-hover:var(--dsw-alias-interactive-bg-hover);--ha-radius:var(--dsw-radius-sm);border:1px solid var(--ha-line);border-radius:var(--ha-radius);max-width:100%;color:var(--ha-ink-secondary);font:inherit;cursor:pointer;white-space:nowrap;background:0 0;align-items:center;gap:6px;padding:2px 8px;font-size:13px;display:inline-flex}body[data-ds-dark-theme] .YWx12G_headerAction{--ha-ink:var(--dsw-alias-label-primary);--ha-ink-secondary:var(--dsw-alias-label-secondary);--ha-blue:var(--dsw-alias-state-business-primary);--ha-blue-ink:var(--dsw-alias-label-primary-foreground);--ha-line:var(--dsw-alias-border-l3);--ha-hover:var(--dsw-alias-interactive-bg-hover);--ha-radius:var(--dsw-radius-sm)}@media (hover:hover){.YWx12G_headerAction:hover{background:var(--ha-hover);color:var(--ha-ink)}}.YWx12G_headerActionCount{border-radius:var(--dsw-radius-xs);background:var(--ha-blue);min-width:18px;color:var(--ha-blue-ink);text-align:center;padding:0 5px;font-size:12px;font-weight:700;display:inline-block}";
		const tagId$1 = "@deepseek-ai/dsh-experimental-client-ui-project-space/project-space.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-experimental-client-ui-project-space";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var project_space_module_css_default = {
			"attention": "YWx12G_attention",
			"attentionClear": "YWx12G_attentionClear",
			"attentionCount": "YWx12G_attentionCount",
			"attentionCountClear": "YWx12G_attentionCountClear",
			"attentionDot": "YWx12G_attentionDot",
			"attentionEmpty": "YWx12G_attentionEmpty",
			"attentionHead": "YWx12G_attentionHead",
			"attentionHint": "YWx12G_attentionHint",
			"attentionItem": "YWx12G_attentionItem",
			"attentionItemMeta": "YWx12G_attentionItemMeta",
			"attentionItemText": "YWx12G_attentionItemText",
			"attentionItems": "YWx12G_attentionItems",
			"attentionTitle": "YWx12G_attentionTitle",
			"canvas": "YWx12G_canvas",
			"canvasBackground": "YWx12G_canvasBackground",
			"canvasDot": "YWx12G_canvasDot",
			"canvasFrame": "YWx12G_canvasFrame",
			"canvasFrameWithDetail": "YWx12G_canvasFrameWithDetail",
			"countChip": "YWx12G_countChip",
			"counts": "YWx12G_counts",
			"detail": "YWx12G_detail",
			"detailBody": "YWx12G_detailBody",
			"detailClose": "YWx12G_detailClose",
			"detailHead": "YWx12G_detailHead",
			"detailHeading": "YWx12G_detailHeading",
			"detailKicker": "YWx12G_detailKicker",
			"detailText": "YWx12G_detailText",
			"detailTitle": "YWx12G_detailTitle",
			"edge": "YWx12G_edge",
			"edgeArrow": "YWx12G_edgeArrow",
			"edgeDimmed": "YWx12G_edgeDimmed",
			"edgeHigher": "YWx12G_edgeHigher",
			"edgeHighlighted": "YWx12G_edgeHighlighted",
			"edgeHit": "YWx12G_edgeHit",
			"edgeLabel": "YWx12G_edgeLabel",
			"edgeLabelBackground": "YWx12G_edgeLabelBackground",
			"edgeLabelDimmed": "YWx12G_edgeLabelDimmed",
			"edgeLabelText": "YWx12G_edgeLabelText",
			"edge_delegate": "YWx12G_edge_delegate",
			"edge_goal-lead": "YWx12G_edge_goal-lead",
			"edge_member-result": "YWx12G_edge_member-result",
			"edge_result": "YWx12G_edge_result",
			"field": "YWx12G_field",
			"fieldLabel": "YWx12G_fieldLabel",
			"fieldValue": "YWx12G_fieldValue",
			"fields": "YWx12G_fields",
			"goalMeta": "YWx12G_goalMeta",
			"goalSummary": "YWx12G_goalSummary",
			"goalText": "YWx12G_goalText",
			"headerAction": "YWx12G_headerAction",
			"headerActionCount": "YWx12G_headerActionCount",
			"hint": "YWx12G_hint",
			"linkList": "YWx12G_linkList",
			"mainColumn": "YWx12G_mainColumn",
			"mutedText": "YWx12G_mutedText",
			"node": "YWx12G_node",
			"nodeAttentionBadge": "YWx12G_nodeAttentionBadge",
			"nodeAttentionBadgeText": "YWx12G_nodeAttentionBadgeText",
			"nodeAttentionLine": "YWx12G_nodeAttentionLine",
			"nodeCard": "YWx12G_nodeCard",
			"nodeDimmed": "YWx12G_nodeDimmed",
			"nodeHighlighted": "YWx12G_nodeHighlighted",
			"nodeKicker": "YWx12G_nodeKicker",
			"nodeLink": "YWx12G_nodeLink",
			"nodeMeta": "YWx12G_nodeMeta",
			"nodeSelectedRing": "YWx12G_nodeSelectedRing",
			"nodeTitle": "YWx12G_nodeTitle",
			"node_goal": "YWx12G_node_goal",
			"node_lead": "YWx12G_node_lead",
			"node_member": "YWx12G_node_member",
			"node_result": "YWx12G_node_result",
			"node_task": "YWx12G_node_task",
			"notice": "YWx12G_notice",
			"pendingChip": "YWx12G_pendingChip",
			"pendingItem": "YWx12G_pendingItem",
			"pendingList": "YWx12G_pendingList",
			"recordsNotice": "YWx12G_recordsNotice",
			"referenceButton": "YWx12G_referenceButton",
			"referenceList": "YWx12G_referenceList",
			"referenceMeta": "YWx12G_referenceMeta",
			"root": "YWx12G_root",
			"sectionHeading": "YWx12G_sectionHeading",
			"shortcutHint": "YWx12G_shortcutHint",
			"stateBody": "YWx12G_stateBody",
			"stateNotice": "YWx12G_stateNotice",
			"stateTitle": "YWx12G_stateTitle",
			"summaryBody": "YWx12G_summaryBody",
			"summaryCard": "YWx12G_summaryCard",
			"summaryCardWide": "YWx12G_summaryCardWide",
			"summaryGoal": "YWx12G_summaryGoal",
			"summaryGrid": "YWx12G_summaryGrid",
			"summaryHeader": "YWx12G_summaryHeader",
			"summaryLink": "YWx12G_summaryLink",
			"summaryList": "YWx12G_summaryList",
			"summaryMeta": "YWx12G_summaryMeta",
			"summaryRecord": "YWx12G_summaryRecord",
			"summaryRecordHead": "YWx12G_summaryRecordHead",
			"summaryReference": "YWx12G_summaryReference",
			"summaryRoot": "YWx12G_summaryRoot",
			"summaryRow": "YWx12G_summaryRow",
			"summarySectionTitle": "YWx12G_summarySectionTitle",
			"summarySubtitle": "YWx12G_summarySubtitle",
			"summaryTitle": "YWx12G_summaryTitle",
			"toolButton": "YWx12G_toolButton",
			"toolButtonActive": "YWx12G_toolButtonActive",
			"toolbar": "YWx12G_toolbar",
			"topbar": "YWx12G_topbar",
			"topbarKicker": "YWx12G_topbarKicker",
			"versionCurrent": "YWx12G_versionCurrent",
			"versionEntry": "YWx12G_versionEntry",
			"versionList": "YWx12G_versionList",
			"versionMeta": "YWx12G_versionMeta",
			"workspace": "YWx12G_workspace"
		};
		//#endregion
		//#region lib/types/client/ReferenceList.js
		/** Explicit record references with same-Session focus and cross-Session opening. */
		/**
		* Render references as explicit buttons. A same-Session reference addresses the
		* exact `seq:<n>` focus; a cross-Session reference opens the source Session and
		* states that exact cross-Session seq focusing is not connected yet.
		* @param props - references and navigation callbacks.
		* @returns the reference list.
		*/
		function ReferenceList({ references, sessionId, t, onFocus, onOpenSession, noticeKeys, sameSessionUnavailable }) {
			const [notice, setNotice] = (0, react.useState)(null);
			if (references.length === 0) return (0, react_jsx_runtime.jsx)("p", {
				className: project_space_module_css_default.mutedText,
				children: t("detail.referencesNone")
			});
			const open = (reference) => {
				setNotice(null);
				if (reference.sessionId === sessionId) {
					if (sameSessionUnavailable === void 0) {
						onFocus(reference.seq);
						return;
					}
					setNotice(sameSessionUnavailable + " (" + t("detail.referenceMeta", {
						sessionId: reference.sessionId,
						seq: reference.seq
					}) + ")");
					return;
				}
				try {
					onOpenSession(reference.sessionId);
					setNotice(t(noticeKeys.cross, { sessionId: reference.sessionId }));
				} catch (error) {
					setNotice(t(noticeKeys.failed, { message: error instanceof Error ? error.message : String(error) }));
				}
			};
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("ul", {
				className: project_space_module_css_default.referenceList,
				children: references.map((reference) => (0, react_jsx_runtime.jsx)("li", { children: (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: cx(project_space_module_css_default.referenceButton),
					onClick: () => {
						open(reference);
					},
					children: [reference.sessionId === sessionId ? t("detail.referenceSame", { seq: reference.seq }) : t("detail.referenceCross"), (0, react_jsx_runtime.jsx)("span", {
						className: project_space_module_css_default.referenceMeta,
						children: t("detail.referenceMeta", {
							sessionId: reference.sessionId,
							seq: reference.seq
						})
					})]
				}) }, reference.sessionId + ":" + reference.seq))
			}), notice !== null && (0, react_jsx_runtime.jsx)("p", {
				className: project_space_module_css_default.notice,
				role: "status",
				children: notice
			})] });
		}
		//#endregion
		//#region lib/types/client/labels.js
		/** Runtime status copy. */
		/**
		* Runtime status copy.
		* @param t - project-space translate seat.
		* @param runtime - explicit member runtime state.
		* @returns the localized runtime label.
		*/
		function runtimeLabel(t, runtime) {
			switch (runtime) {
				case "running": return t("runtime.running");
				case "inactive": return t("runtime.inactive");
				case "provisioning": return t("runtime.provisioning");
				case "failed": return t("runtime.failed");
				case "unknown": return t("runtime.unknown");
			}
		}
		/** Native Goal phase copy. */
		/**
		* Native Goal phase copy.
		* @param t - project-space translate seat.
		* @param phase - native goal lifecycle phase.
		* @returns the localized phase label.
		*/
		function goalPhaseLabel(t, phase) {
			switch (phase) {
				case "active": return t("goal.phase.active");
				case "paused": return t("goal.phase.paused");
				case "blocked": return t("goal.phase.blocked");
				case "complete": return t("goal.phase.complete");
			}
		}
		/** Shared-task status copy. */
		/**
		* Shared-task status copy.
		* @param t - project-space translate seat.
		* @param status - durable task status.
		* @returns the localized status label.
		*/
		function taskStatusLabel(t, status) {
			switch (status) {
				case "pending": return t("task.status.pending");
				case "in_progress": return t("task.status.in_progress");
				case "completed": return t("task.status.completed");
				case "deleted": return t("task.status.completed");
			}
		}
		/** Task owner resolution copy. */
		/**
		* Task owner resolution copy.
		* @param t - project-space translate seat.
		* @param state - task owner resolution state.
		* @returns the localized owner-resolution label.
		*/
		function ownerStateLabel(t, state) {
			switch (state) {
				case "assigned": return t("common.none");
				case "unassigned": return t("task.ownerUnknown");
				case "ambiguous": return t("task.ownerAmbiguous");
			}
		}
		/** Node kind copy. */
		/**
		* Node kind copy.
		* @param t - project-space translate seat.
		* @param kind - project-space node kind.
		* @returns the localized node-kind label.
		*/
		function nodeKindLabel(t, kind) {
			switch (kind) {
				case "goal": return t("node.goal");
				case "lead": return t("node.lead");
				case "member": return t("node.member");
				case "task": return t("node.task");
				case "result": return t("node.result");
			}
		}
		/** Edge kind copy. */
		/**
		* Edge kind copy.
		* @param t - project-space translate seat.
		* @param kind - project-space edge kind.
		* @returns the localized edge label.
		*/
		function edgeLabel(t, kind) {
			switch (kind) {
				case "goal-lead": return t("edge.goalLead");
				case "delegate": return t("edge.delegate");
				case "task": return t("edge.task");
				case "result": return t("edge.result");
				case "member-result": return t("edge.memberResult");
			}
		}
		//#endregion
		//#region lib/types/client/ProjectSummaryView.js
		/** Project summary view: the same real projections as a dense, readable page. */
		/**
		* Render the project summary. Node identity and counts match the workflow view
		* because both fold the same model; every link carries the workflow node id.
		* @param props - conversation view props plus the injected Session-opening action.
		* @returns the summary view.
		*/
		function ProjectSummaryView(props) {
			const { t, openView, openSourceSession } = props;
			const model = useProjectSpaceModel(props);
			const [notice, setNotice] = (0, react.useState)(null);
			const openWorkflow = (0, react.useCallback)((nodeId) => {
				openView("workflow", "node:" + nodeId);
			}, [openView]);
			const openSource = (0, react.useCallback)((sessionId) => {
				openSourceSession(sessionId);
				setNotice(t("detail.referenceCrossNotice", { sessionId }));
			}, [openSourceSession, t]);
			const goalText = model.goal === null ? t("shell.goalUnavailable") : model.goal.goalState === "set" ? model.goal.objective ?? t("shell.goalMissing") : model.goal.goalState === "unset" ? t("shell.goalMissing") : t("shell.goalUnavailable");
			return (0, react_jsx_runtime.jsxs)("div", {
				className: project_space_module_css_default.summaryRoot,
				"data-conversation-composer-overlay": "",
				"data-project-space-view": "project-summary",
				"data-project-space-state": model.phase,
				children: [(0, react_jsx_runtime.jsxs)("header", {
					className: project_space_module_css_default.summaryHeader,
					children: [(0, react_jsx_runtime.jsx)("h2", {
						className: project_space_module_css_default.summaryTitle,
						children: t("summary.title")
					}), (0, react_jsx_runtime.jsx)("p", {
						className: project_space_module_css_default.summarySubtitle,
						children: t("summary.subtitle")
					})]
				}), model.phase !== "ready" ? (0, react_jsx_runtime.jsxs)("div", {
					className: project_space_module_css_default.stateNotice,
					"data-project-space-empty": "",
					role: model.phase === "error" ? "alert" : "status",
					children: [(0, react_jsx_runtime.jsx)("p", {
						className: project_space_module_css_default.stateTitle,
						children: model.phase === "loading" ? t("shell.loading") : model.phase === "error" ? t("shell.projectionError", { message: model.errorMessage ?? t("shell.projectionUnknownError") }) : t("shell.teamAbsent")
					}), model.phase === "team-absent" && (0, react_jsx_runtime.jsx)("p", {
						className: project_space_module_css_default.stateBody,
						children: t("shell.teamAbsentHint")
					})]
				}) : (0, react_jsx_runtime.jsxs)("div", {
					className: project_space_module_css_default.summaryGrid,
					children: [
						(0, react_jsx_runtime.jsxs)("section", {
							className: project_space_module_css_default.summaryCard,
							"data-summary-section": "goal",
							"aria-label": t("summary.goal"),
							children: [
								(0, react_jsx_runtime.jsx)("h3", {
									className: project_space_module_css_default.summarySectionTitle,
									children: t("summary.goal")
								}),
								(0, react_jsx_runtime.jsx)("p", {
									className: project_space_module_css_default.summaryGoal,
									children: goalText
								}),
								model.goal !== null && model.goal.goalState === "set" && model.goal.phase !== null && (0, react_jsx_runtime.jsxs)("p", {
									className: project_space_module_css_default.summaryMeta,
									children: [goalPhaseLabel(t, model.goal.phase), model.goal.roundsStarted !== null && model.goal.maxGoalRounds !== null ? " · " + t("goal.rounds", {
										started: model.goal.roundsStarted,
										max: model.goal.maxGoalRounds
									}) : ""]
								}),
								(0, react_jsx_runtime.jsx)("p", {
									className: project_space_module_css_default.hint,
									children: t("shell.noPercent")
								})
							]
						}),
						(0, react_jsx_runtime.jsxs)("section", {
							className: project_space_module_css_default.summaryCard,
							"data-summary-section": "attention",
							"aria-label": t("summary.attention"),
							children: [(0, react_jsx_runtime.jsxs)("h3", {
								className: project_space_module_css_default.summarySectionTitle,
								children: [t("summary.attention"), (0, react_jsx_runtime.jsx)("span", {
									className: cx(project_space_module_css_default.attentionCount, model.attention.length === 0 && project_space_module_css_default.attentionCountClear),
									"data-attention-badge": model.attention.length,
									children: model.attention.length === 0 ? t("summary.pendingNone") : t("summary.pending", { count: model.attention.length })
								})]
							}), model.attention.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
								className: project_space_module_css_default.mutedText,
								children: t("attention.clear")
							}) : (0, react_jsx_runtime.jsx)("ul", {
								className: project_space_module_css_default.summaryList,
								children: model.attention.map((item) => (0, react_jsx_runtime.jsx)("li", { children: (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: project_space_module_css_default.summaryLink,
									onClick: () => {
										openWorkflow(item.recordNodeId);
									},
									children: [item.text, (0, react_jsx_runtime.jsx)("span", {
										className: project_space_module_css_default.summaryMeta,
										children: t("attention.record", {
											title: item.recordTitle,
											revision: item.recordRevision
										})
									})]
								}) }, item.id))
							})]
						}),
						(0, react_jsx_runtime.jsxs)("section", {
							className: project_space_module_css_default.summaryCard,
							"data-summary-section": "members",
							"aria-label": t("summary.members"),
							children: [
								(0, react_jsx_runtime.jsx)("h3", {
									className: project_space_module_css_default.summarySectionTitle,
									children: t("summary.members")
								}),
								(0, react_jsx_runtime.jsx)("p", {
									className: project_space_module_css_default.hint,
									children: t("summary.live")
								}),
								model.members.length === 0 && model.lead === null ? (0, react_jsx_runtime.jsx)("p", {
									className: project_space_module_css_default.mutedText,
									children: t("summary.membersNone")
								}) : (0, react_jsx_runtime.jsxs)("ul", {
									className: project_space_module_css_default.summaryList,
									children: [model.lead !== null && (0, react_jsx_runtime.jsxs)("li", {
										className: project_space_module_css_default.summaryRow,
										"data-member-id": model.lead.id,
										children: [(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: project_space_module_css_default.summaryLink,
											onClick: () => {
												openWorkflow(model.lead === null ? "lead" : model.lead.id);
											},
											children: model.lead.name
										}), (0, react_jsx_runtime.jsxs)("span", {
											className: project_space_module_css_default.summaryMeta,
											children: [
												runtimeLabel(t, model.lead.runtime),
												" · ",
												t("node.lead")
											]
										})]
									}), model.members.map((member) => (0, react_jsx_runtime.jsxs)("li", {
										className: project_space_module_css_default.summaryRow,
										"data-member-id": member.id,
										children: [(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: project_space_module_css_default.summaryLink,
											onClick: () => {
												openWorkflow(member.id);
											},
											children: member.name
										}), (0, react_jsx_runtime.jsxs)("span", {
											className: project_space_module_css_default.summaryMeta,
											children: [
												runtimeLabel(t, member.runtime),
												" · ",
												t("summary.taskCount", { count: member.taskCount }),
												member.pendingCount > 0 ? " · " + t("summary.pending", { count: member.pendingCount }) : ""
											]
										})]
									}, member.id))]
								})
							]
						}),
						(0, react_jsx_runtime.jsxs)("section", {
							className: project_space_module_css_default.summaryCard,
							"data-summary-section": "tasks",
							"aria-label": t("summary.tasks"),
							children: [(0, react_jsx_runtime.jsx)("h3", {
								className: project_space_module_css_default.summarySectionTitle,
								children: t("summary.tasks")
							}), model.tasks.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
								className: project_space_module_css_default.mutedText,
								children: t("summary.tasksNone")
							}) : (0, react_jsx_runtime.jsx)("ul", {
								className: project_space_module_css_default.summaryList,
								children: model.tasks.map((task) => (0, react_jsx_runtime.jsxs)("li", {
									className: project_space_module_css_default.summaryRow,
									"data-task-id": task.id,
									children: [
										(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: project_space_module_css_default.summaryLink,
											onClick: () => {
												openWorkflow(task.id);
											},
											children: task.subject
										}),
										(0, react_jsx_runtime.jsxs)("span", {
											className: project_space_module_css_default.summaryMeta,
											children: [
												taskStatusLabel(t, task.status),
												task.status === "pending" ? " · " + (task.ready ? t("summary.ready") : t("task.blocked")) : "",
												" · ",
												task.ownerName ?? (task.ownerState === "ambiguous" ? t("summary.ownerAmbiguous") : t("summary.unowned"))
											]
										}),
										task.blockedBy.length > 0 && (0, react_jsx_runtime.jsx)("span", {
											className: project_space_module_css_default.summaryMeta,
											children: t("summary.blockedBy", { ids: task.blockedBy.join(", ") })
										})
									]
								}, task.id))
							})]
						}),
						(0, react_jsx_runtime.jsxs)("section", {
							className: cx(project_space_module_css_default.summaryCard, project_space_module_css_default.summaryCardWide),
							"data-summary-section": "records",
							"aria-label": t("summary.records"),
							children: [
								(0, react_jsx_runtime.jsx)("h3", {
									className: project_space_module_css_default.summarySectionTitle,
									children: t("summary.records")
								}),
								notice !== null && (0, react_jsx_runtime.jsx)("p", {
									className: project_space_module_css_default.notice,
									role: "status",
									children: notice
								}),
								model.results.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
									className: project_space_module_css_default.mutedText,
									children: t("summary.recordsNone")
								}) : (0, react_jsx_runtime.jsx)("ul", {
									className: project_space_module_css_default.summaryList,
									children: model.results.map((record) => {
										const updated = formatTimestamp(record.updatedTime);
										return (0, react_jsx_runtime.jsxs)("li", {
											className: project_space_module_css_default.summaryRecord,
											"data-result-id": record.recordId,
											"data-version-revision": record.revision,
											children: [
												(0, react_jsx_runtime.jsxs)("div", {
													className: project_space_module_css_default.summaryRecordHead,
													children: [(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: project_space_module_css_default.summaryLink,
														onClick: () => {
															openWorkflow(record.id);
														},
														children: record.title
													}), (0, react_jsx_runtime.jsx)("span", {
														className: project_space_module_css_default.summaryMeta,
														children: t("summary.versions", { count: record.versions.length })
													})]
												}),
												(0, react_jsx_runtime.jsx)("p", {
													className: project_space_module_css_default.summaryBody,
													children: record.summary
												}),
												(0, react_jsx_runtime.jsxs)("p", {
													className: project_space_module_css_default.summaryMeta,
													children: [
														t("summary.author"),
														": ",
														record.authorName,
														" · ",
														t("detail.revision", { revision: record.revision }),
														updated === null ? "" : " · " + t("summary.updated") + " " + updated
													]
												}),
												!record.associationsProvided && (0, react_jsx_runtime.jsx)("p", {
													className: project_space_module_css_default.mutedText,
													children: t("summary.associationsMissing")
												}),
												record.pending.length > 0 && (0, react_jsx_runtime.jsx)("ul", {
													className: project_space_module_css_default.pendingList,
													children: record.pending.map((item) => (0, react_jsx_runtime.jsx)("li", {
														className: project_space_module_css_default.pendingItem,
														children: item.text
													}, item.id))
												}),
												(0, react_jsx_runtime.jsx)("div", {
													className: project_space_module_css_default.summaryReference,
													children: (0, react_jsx_runtime.jsx)(ReferenceList, {
														references: record.references,
														sessionId: props.sessionId,
														t,
														onFocus: () => {},
														onOpenSession: openSource,
														sameSessionUnavailable: t("panel.referenceSameUnavailable"),
														noticeKeys: {
															cross: "detail.referenceCrossNotice",
															failed: "detail.referenceFailed"
														}
													})
												})
											]
										}, record.id);
									})
								})
							]
						})
					]
				})]
			});
		}
		//#endregion
		//#region lib/types/client/RecordsHeaderAction.js
		/**
		* Render the records entry with the live pending-decision count, so a human
		* pending decision is visible from the conversation header without opening the
		* Sidebar. Pending items come from the latest record revisions only.
		* @param props - standard Session seats, the opening action, and copy.
		* @returns the header entry button.
		*/
		function RecordsHeaderAction({ sessionId, useSession, useProjection, useSessions, useSessionStatus, openRecords, t }) {
			const pending = useProjectSpaceModel({
				sessionId,
				useSession,
				useProjection,
				useSessions,
				useSessionStatus
			}).counts.pending;
			const label = pending > 0 ? t("header.trigger") + " · " + t("count.pending", { count: pending }) : t("header.trigger");
			return (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: project_space_module_css_default.headerAction,
				"data-collab-header-action": "",
				"data-pending-count": pending,
				"aria-label": label,
				title: label,
				onClick: () => {
					openRecords();
				},
				children: [t("header.trigger"), pending > 0 && (0, react_jsx_runtime.jsx)("span", {
					className: project_space_module_css_default.headerActionCount,
					"data-collab-header-count": "",
					children: pending
				})]
			});
		}
		//#endregion
		//#region \0dsh-css:D:\dsh-upstream\packages\experimental\client-ui-project-space\src\client\records-panel.module.css.mjs
		const css = ".Bk9hrG_panel{--cl-card:var(--dsw-alias-bg-layer-1);--cl-raised:var(--dsw-alias-bg-layer-2);--cl-ink:var(--dsw-alias-label-primary);--cl-ink-secondary:var(--dsw-alias-label-secondary);--cl-ink-tertiary:var(--dsw-alias-label-tertiary);--cl-line:var(--dsw-alias-border-l2);--cl-line-strong:var(--dsw-alias-border-l3);--cl-line-soft:var(--dsw-alias-border-l1);--cl-blue:var(--dsw-alias-state-business-primary);--cl-blue-ink:var(--dsw-alias-label-primary-foreground);--cl-blue-soft:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, var(--dsw-alias-bg-layer-1));--cl-hover:var(--dsw-alias-interactive-bg-hover);--cl-radius:var(--dsw-radius-md);box-sizing:border-box;background:var(--cl-card);min-width:0;height:100%;min-height:0;color:var(--cl-ink);flex-direction:column;gap:8px;margin:0;padding:10px 12px 16px;font-size:13px;line-height:1.5;display:flex;overflow-y:auto}body[data-ds-dark-theme] .Bk9hrG_panel{--cl-card:var(--dsw-alias-bg-layer-2);--cl-raised:var(--dsw-alias-bg-layer-3);--cl-ink:var(--dsw-alias-label-primary);--cl-ink-secondary:var(--dsw-alias-label-secondary);--cl-ink-tertiary:var(--dsw-alias-label-tertiary);--cl-line:var(--dsw-alias-border-l2);--cl-line-strong:var(--dsw-alias-border-l3);--cl-line-soft:var(--dsw-alias-border-l1);--cl-blue:var(--dsw-alias-state-business-primary);--cl-blue-ink:var(--dsw-alias-label-primary-foreground);--cl-blue-soft:color-mix(in srgb, var(--dsw-alias-state-business-primary) 24%, var(--dsw-alias-bg-layer-2));--cl-hover:var(--dsw-alias-interactive-bg-hover);--cl-radius:var(--dsw-radius-md)}.Bk9hrG_panelHead{flex-direction:column;gap:2px;min-width:0;display:flex}.Bk9hrG_panelTitle{color:var(--cl-ink);margin:0;font-size:14px;font-weight:600}.Bk9hrG_panelSubtitle{color:var(--cl-ink-secondary);overflow-wrap:anywhere;margin:0;font-size:13px}.Bk9hrG_hint{color:var(--cl-ink-tertiary);overflow-wrap:anywhere;margin:0;font-size:13px}.Bk9hrG_mutedText{color:var(--cl-ink-secondary);overflow-wrap:anywhere;margin:0;font-size:13px}.Bk9hrG_notice{border:1px solid var(--cl-blue);border-radius:var(--dsw-radius-sm);background:var(--cl-blue-soft);color:var(--cl-ink);overflow-wrap:anywhere;border-left-width:4px;margin:0;padding:5px 9px;font-size:13px}.Bk9hrG_recordList{flex-direction:column;gap:8px;min-width:0;display:flex}.Bk9hrG_record{border:1px solid var(--cl-line);border-radius:var(--cl-radius);background:var(--cl-raised);flex-direction:column;gap:6px;min-width:0;padding:10px 12px;display:flex}.Bk9hrG_recordHead{flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px;min-width:0;display:flex}.Bk9hrG_recordTitle{color:var(--cl-ink);overflow-wrap:anywhere;margin:0;font-size:14px;font-weight:600}.Bk9hrG_recordRevision{border:1px solid var(--cl-line);border-radius:var(--dsw-radius-xs);color:var(--cl-ink-secondary);white-space:nowrap;padding:1px 7px;font-size:12px}.Bk9hrG_recordMeta{color:var(--cl-ink-secondary);overflow-wrap:anywhere;flex-wrap:wrap;gap:4px 12px;margin:0;font-size:13px;display:flex}.Bk9hrG_recordSummary{color:var(--cl-ink);overflow-wrap:anywhere;margin:0;font-size:13px;font-weight:500}.Bk9hrG_recordContent{color:var(--cl-ink-secondary);white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font-size:13px}.Bk9hrG_subsection{border-top:1px solid var(--cl-line-soft);flex-direction:column;gap:4px;min-width:0;padding-top:6px;display:flex}.Bk9hrG_subsectionTitle{color:var(--cl-ink);margin:0;font-size:13px;font-weight:600}.Bk9hrG_pendingList{flex-wrap:wrap;gap:4px;margin:0;padding:0;list-style:none;display:flex}.Bk9hrG_pendingItem{border-left:4px solid var(--cl-blue);border-radius:var(--dsw-radius-xs);background:var(--cl-blue-soft);color:var(--cl-ink);overflow-wrap:anywhere;padding:2px 8px;font-size:13px}.Bk9hrG_associationGroup{border:1px solid var(--cl-line);border-radius:var(--dsw-radius-xs);padding:1px 6px;font-size:12px}.Bk9hrG_referenceList{flex-wrap:wrap;gap:4px;margin:0;padding:0;list-style:none;display:flex}.Bk9hrG_referenceButton{border:1px solid var(--cl-line);border-radius:var(--dsw-radius-sm);background:var(--cl-card);max-width:100%;color:var(--cl-ink);font:inherit;text-align:left;cursor:pointer;flex-direction:column;align-items:flex-start;gap:1px;padding:3px 8px;font-size:13px;display:flex}@media (hover:hover){.Bk9hrG_referenceButton:hover{background:var(--cl-hover);border-color:var(--cl-blue)}}.Bk9hrG_referenceMeta{color:var(--cl-ink-secondary);overflow-wrap:anywhere;font-size:12px}.Bk9hrG_versionsToggle{border:1px solid var(--cl-line);border-radius:var(--dsw-radius-sm);background:var(--cl-card);color:var(--cl-ink-secondary);font:inherit;cursor:pointer;align-self:flex-start;padding:2px 9px;font-size:13px}@media (hover:hover){.Bk9hrG_versionsToggle:hover{background:var(--cl-hover);color:var(--cl-ink)}}.Bk9hrG_versionList{flex-direction:column;gap:4px;margin:0;padding:0;list-style:none;display:flex}.Bk9hrG_versionEntry{border:1px solid var(--cl-line);border-radius:var(--dsw-radius-sm);color:var(--cl-ink);overflow-wrap:anywhere;flex-direction:column;gap:1px;padding:4px 8px;font-size:13px;display:flex}.Bk9hrG_versionCurrent{border-color:var(--cl-blue)}.Bk9hrG_versionTitle{font-weight:500}.Bk9hrG_versionMeta{color:var(--cl-ink-secondary);overflow-wrap:anywhere;font-size:12px}@media (width<=768px){.Bk9hrG_panel,.Bk9hrG_record{padding:8px}}";
		const tagId = "@deepseek-ai/dsh-experimental-client-ui-project-space/records-panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-experimental-client-ui-project-space";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var records_panel_module_css_default = {
			"associationGroup": "Bk9hrG_associationGroup",
			"hint": "Bk9hrG_hint",
			"mutedText": "Bk9hrG_mutedText",
			"notice": "Bk9hrG_notice",
			"panel": "Bk9hrG_panel",
			"panelHead": "Bk9hrG_panelHead",
			"panelSubtitle": "Bk9hrG_panelSubtitle",
			"panelTitle": "Bk9hrG_panelTitle",
			"pendingItem": "Bk9hrG_pendingItem",
			"pendingList": "Bk9hrG_pendingList",
			"record": "Bk9hrG_record",
			"recordContent": "Bk9hrG_recordContent",
			"recordHead": "Bk9hrG_recordHead",
			"recordList": "Bk9hrG_recordList",
			"recordMeta": "Bk9hrG_recordMeta",
			"recordRevision": "Bk9hrG_recordRevision",
			"recordSummary": "Bk9hrG_recordSummary",
			"recordTitle": "Bk9hrG_recordTitle",
			"referenceButton": "Bk9hrG_referenceButton",
			"referenceList": "Bk9hrG_referenceList",
			"referenceMeta": "Bk9hrG_referenceMeta",
			"subsection": "Bk9hrG_subsection",
			"subsectionTitle": "Bk9hrG_subsectionTitle",
			"versionCurrent": "Bk9hrG_versionCurrent",
			"versionEntry": "Bk9hrG_versionEntry",
			"versionList": "Bk9hrG_versionList",
			"versionMeta": "Bk9hrG_versionMeta",
			"versionTitle": "Bk9hrG_versionTitle",
			"versionsToggle": "Bk9hrG_versionsToggle"
		};
		//#endregion
		//#region lib/types/client/RecordsPanel.js
		/**
		* Body of the native right-Sidebar collaboration-records tab: the Lead's
		* records, read-only. In the downgraded build an exact same-Session seq focus
		* needs a native extension, so the panel states that boundary instead.
		*/
		/** One record card with pending decisions, associations, references, and versions. */
		function RecordCard({ record, sessionId, openSource, t, expanded, onToggle, onNotice }) {
			const updated = formatTimestamp(record.updatedTime);
			const hasAssociations = record.taskIds.length > 0 || record.memberSessionIds.length > 0;
			const reference = (target) => {
				onNotice(null);
				if (target.sessionId === sessionId) {
					onNotice(t("panel.referenceSameUnavailable") + " (" + t("detail.referenceMeta", {
						sessionId: target.sessionId,
						seq: target.seq
					}) + ")");
					return;
				}
				try {
					openSource(target.sessionId);
					onNotice(t("collab.referenceCrossNotice", { sessionId: target.sessionId }));
				} catch (error) {
					onNotice(t("collab.referenceFailed", { message: error instanceof Error ? error.message : String(error) }));
				}
			};
			const versions = record.versions;
			return (0, react_jsx_runtime.jsxs)("article", {
				className: records_panel_module_css_default.record,
				"data-collab-record-id": record.recordId,
				"data-collab-revision": record.revision,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: records_panel_module_css_default.recordHead,
						children: [(0, react_jsx_runtime.jsx)("h3", {
							className: records_panel_module_css_default.recordTitle,
							children: record.title
						}), (0, react_jsx_runtime.jsx)("span", {
							className: records_panel_module_css_default.recordRevision,
							children: t("collab.revision", { revision: record.revision })
						})]
					}),
					(0, react_jsx_runtime.jsxs)("p", {
						className: records_panel_module_css_default.recordMeta,
						children: [
							t("collab.author"),
							": ",
							record.authorName,
							" · ",
							(0, react_jsx_runtime.jsx)("span", {
								"data-collab-updated": record.updatedTime,
								children: t("collab.updated", { time: updated ?? t("time.unknown") })
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: records_panel_module_css_default.recordSummary,
						children: record.summary
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: records_panel_module_css_default.recordContent,
						children: record.content
					}),
					(0, react_jsx_runtime.jsxs)("section", {
						className: records_panel_module_css_default.subsection,
						"data-collab-pending": "",
						"data-collab-pending-count": record.pending.length,
						children: [(0, react_jsx_runtime.jsx)("h4", {
							className: records_panel_module_css_default.subsectionTitle,
							children: t("collab.pending")
						}), record.pending.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
							className: records_panel_module_css_default.mutedText,
							children: t("collab.pendingNone")
						}) : (0, react_jsx_runtime.jsx)("ul", {
							className: records_panel_module_css_default.pendingList,
							children: record.pending.map((item) => (0, react_jsx_runtime.jsx)("li", {
								className: records_panel_module_css_default.pendingItem,
								"data-collab-pending-item": item.id,
								children: item.text
							}, item.id))
						})]
					}),
					(0, react_jsx_runtime.jsxs)("section", {
						className: records_panel_module_css_default.subsection,
						children: [(0, react_jsx_runtime.jsx)("h4", {
							className: records_panel_module_css_default.subsectionTitle,
							children: t("collab.associations")
						}), hasAssociations ? (0, react_jsx_runtime.jsxs)("p", {
							className: records_panel_module_css_default.recordMeta,
							children: [record.taskIds.length > 0 && (0, react_jsx_runtime.jsxs)("span", {
								className: records_panel_module_css_default.associationGroup,
								"data-collab-association-tasks": record.taskIds.join(","),
								children: [
									t("detail.associationsTasks"),
									": ",
									record.taskIds.join(", ")
								]
							}), record.memberSessionIds.length > 0 && (0, react_jsx_runtime.jsxs)("span", {
								className: records_panel_module_css_default.associationGroup,
								"data-collab-association-members": record.memberSessionIds.join(","),
								children: [
									t("detail.associationsMembers"),
									": ",
									record.memberSessionIds.join(", ")
								]
							})]
						}) : (0, react_jsx_runtime.jsx)("p", {
							className: records_panel_module_css_default.mutedText,
							children: t("collab.associationsMissing")
						})]
					}),
					(0, react_jsx_runtime.jsxs)("section", {
						className: records_panel_module_css_default.subsection,
						children: [(0, react_jsx_runtime.jsx)("h4", {
							className: records_panel_module_css_default.subsectionTitle,
							children: t("collab.references")
						}), record.references.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
							className: records_panel_module_css_default.mutedText,
							children: t("collab.referencesNone")
						}) : (0, react_jsx_runtime.jsx)("ul", {
							className: records_panel_module_css_default.referenceList,
							children: record.references.map((item) => (0, react_jsx_runtime.jsx)("li", { children: (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: records_panel_module_css_default.referenceButton,
								"data-reference-session": item.sessionId,
								"data-reference-seq": item.seq,
								onClick: () => {
									reference(item);
								},
								children: [item.sessionId === sessionId ? t("collab.referenceSame", { seq: item.seq }) : t("collab.referenceCross"), (0, react_jsx_runtime.jsx)("span", {
									className: records_panel_module_css_default.referenceMeta,
									children: t("detail.referenceMeta", {
										sessionId: item.sessionId,
										seq: item.seq
									})
								})]
							}) }, item.sessionId + ":" + item.seq))
						})]
					}),
					(0, react_jsx_runtime.jsxs)("section", {
						className: records_panel_module_css_default.subsection,
						children: [(0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: records_panel_module_css_default.versionsToggle,
							"aria-expanded": expanded,
							"data-collab-versions-toggle": "",
							onClick: onToggle,
							children: expanded ? t("collab.versionsToggleCollapse") : t("collab.versionsToggle")
						}), expanded && (0, react_jsx_runtime.jsx)("ol", {
							className: records_panel_module_css_default.versionList,
							children: versions.map((version) => (0, react_jsx_runtime.jsxs)("li", {
								className: cx(records_panel_module_css_default.versionEntry, version.revision === record.revision && records_panel_module_css_default.versionCurrent),
								"data-collab-version": version.revision,
								"data-collab-version-seq": version.seq,
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: records_panel_module_css_default.versionTitle,
									children: version.title
								}), (0, react_jsx_runtime.jsx)("span", {
									className: records_panel_module_css_default.versionMeta,
									children: t("detail.versionEntry", {
										revision: version.revision,
										seq: version.seq
									}) + " · " + (formatTimestamp(version.time) ?? t("time.unknown")) + (version.revision === record.revision ? " · " + t("collab.versionCurrent") : "")
								})]
							}, version.revision))
						})]
					})
				]
			});
		}
		/**
		* Render the records panel. It only displays Lead-authored record revisions and
		* never writes one; pending decisions stay until a newer Lead revision drops
		* them, independent of viewing.
		* @param props - Session standard seats, the injected Session-opening action, and copy.
		* @returns the right-Sidebar panel body.
		*/
		function RecordsPanel({ sessionId, useSession, useProjection, useSessions, useSessionStatus, openSourceSession, t }) {
			const model = useProjectSpaceModel({
				sessionId,
				useSession,
				useProjection,
				useSessions,
				useSessionStatus
			});
			const [expanded, setExpanded] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			const [notice, setNotice] = (0, react.useState)(null);
			const toggle = (recordId) => {
				setExpanded((current) => {
					const next = new Set(current);
					if (next.has(recordId)) next.delete(recordId);
					else next.add(recordId);
					return next;
				});
			};
			const header = (0, react_jsx_runtime.jsxs)("header", {
				className: records_panel_module_css_default.panelHead,
				children: [
					(0, react_jsx_runtime.jsx)("h2", {
						className: records_panel_module_css_default.panelTitle,
						children: t("collab.title")
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: records_panel_module_css_default.panelSubtitle,
						children: t("collab.subtitle")
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: records_panel_module_css_default.hint,
						children: t("collab.readonly")
					})
				]
			});
			if (model.phase !== "ready") {
				const stateText = model.phase === "loading" ? t("shell.loading") : model.phase === "error" ? t("shell.projectionError", { message: model.errorMessage ?? t("shell.projectionUnknownError") }) : t("shell.teamAbsent");
				return (0, react_jsx_runtime.jsxs)("section", {
					className: records_panel_module_css_default.panel,
					"data-collaboration-panel": "",
					"data-collab-panel-phase": model.phase,
					"aria-label": t("collab.title"),
					children: [
						header,
						(0, react_jsx_runtime.jsx)("p", {
							className: model.phase === "error" ? records_panel_module_css_default.notice : records_panel_module_css_default.mutedText,
							role: model.phase === "error" ? "alert" : "status",
							"data-collab-empty": model.phase,
							children: stateText
						}),
						model.phase === "team-absent" && (0, react_jsx_runtime.jsx)("p", {
							className: records_panel_module_css_default.mutedText,
							children: t("shell.teamAbsentHint")
						})
					]
				});
			}
			return (0, react_jsx_runtime.jsxs)("section", {
				className: records_panel_module_css_default.panel,
				"data-collaboration-panel": "",
				"data-collab-panel-phase": "ready",
				"aria-label": t("collab.title"),
				children: [
					header,
					notice !== null && (0, react_jsx_runtime.jsx)("p", {
						className: records_panel_module_css_default.notice,
						role: "status",
						"data-collab-notice": "",
						children: notice
					}),
					model.results.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
						className: records_panel_module_css_default.mutedText,
						"data-collab-empty": "records",
						children: model.recordsAvailable ? t("collab.empty") : t("collab.unavailable")
					}) : (0, react_jsx_runtime.jsx)("div", {
						className: records_panel_module_css_default.recordList,
						children: model.results.map((record) => (0, react_jsx_runtime.jsx)(RecordCard, {
							record,
							sessionId,
							openSource: openSourceSession,
							t,
							expanded: expanded.has(record.recordId),
							onToggle: () => {
								toggle(record.recordId);
							},
							onNotice: setNotice
						}, record.recordId))
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/data/layout.js
		/** Card size per node kind; sizes stay constant so a projection update cannot resize. */
		const NODE_SIZES = {
			goal: {
				width: 260,
				height: 104
			},
			lead: {
				width: 240,
				height: 92
			},
			member: {
				width: 240,
				height: 92
			},
			task: {
				width: 250,
				height: 96
			},
			result: {
				width: 290,
				height: 124
			}
		};
		/** Column origins of the flow: instruction → Lead → members → tasks → results. */
		const LANE_X = {
			goal: 32,
			lead: 32,
			member: 372,
			task: 700,
			result: 1036
		};
		/** First-row world y. */
		const TOP = 24;
		/** Vertical gap between cards in one lane. */
		const GAP = 20;
		/** Canvas size used before a real measurement (or under jsdom, which has no layout). */
		const DEFAULT_CANVAS_SIZE = {
			width: 960,
			height: 520
		};
		/**
		* Whether one stored position is a finite two-number tuple.
		* @param value - candidate persisted or computed position.
		* @returns true when the value is a finite [x, y] tuple.
		*/
		function isPosition(value) {
			return Array.isArray(value) && value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
		}
		/**
		* Merge permanent node positions with computed defaults. Existing positions
		* win, so a projection subscription update never reflows a moved node; only a
		* genuinely new node receives its lane default.
		* @param model - current project-space model.
		* @param current - positions already persisted or moved in this mounted view.
		* @returns the complete position table for rendering.
		*/
		function layoutPositions(model, current) {
			const next = { ...current };
			const place = (id, lane, index) => {
				if (isPosition(current[id])) return;
				next[id] = [LANE_X[lane], TOP + index * (NODE_SIZES[lane].height + GAP)];
			};
			if (model.goal !== null) place(model.goal.id, "goal", 0);
			if (model.lead !== null && !isPosition(current["lead"])) next["lead"] = [LANE_X.lead, TOP + NODE_SIZES.goal.height + 36];
			model.members.forEach((member, index) => {
				place(member.id, "member", index);
			});
			model.tasks.forEach((task, index) => {
				place(task.id, "task", index);
			});
			model.results.forEach((result, index) => {
				place(result.id, "result", index);
			});
			return next;
		}
		/**
		* Every node rendered by the canvas with its world box.
		* @param model - current project-space model.
		* @param positions - complete position table for every rendered node.
		* @returns one box per positioned node.
		*/
		function nodeBoxes(model, positions) {
			const boxes = [];
			const push = (node) => {
				const position = positions[node.id];
				if (!isPosition(position)) return;
				const size = NODE_SIZES[node.kind];
				boxes.push({
					id: node.id,
					kind: node.kind,
					x: position[0],
					y: position[1],
					width: size.width,
					height: size.height
				});
			};
			if (model.goal !== null) push(model.goal);
			if (model.lead !== null) push(model.lead);
			for (const member of model.members) push(member);
			for (const task of model.tasks) push(task);
			for (const result of model.results) push(result);
			return boxes;
		}
		/**
		* World bounds of every rendered box.
		* @param boxes - node boxes currently rendered.
		* @returns the enclosing world bounds, or null for an empty canvas.
		*/
		function contentBounds(boxes) {
			const first = boxes[0];
			if (first === void 0) return null;
			let minX = first.x;
			let minY = first.y;
			let maxX = first.x + first.width;
			let maxY = first.y + first.height;
			for (const box of boxes) {
				minX = Math.min(minX, box.x);
				minY = Math.min(minY, box.y);
				maxX = Math.max(maxX, box.x + box.width);
				maxY = Math.max(maxY, box.y + box.height);
			}
			return {
				minX,
				minY,
				maxX,
				maxY,
				width: maxX - minX,
				height: maxY - minY
			};
		}
		/** Smallest and largest zoom factors the canvas accepts. */
		const MIN_SCALE = .25;
		/**
		* Clamp one zoom factor into the supported range.
		* @param scale - requested zoom factor.
		* @returns the factor clamped to the canvas limits (1 for a non-finite value).
		*/
		function clampScale(scale) {
			if (!Number.isFinite(scale)) return 1;
			return Math.min(2, Math.max(MIN_SCALE, scale));
		}
		/**
		* Fit every node into the canvas viewport.
		* @param bounds - world content bounds.
		* @param size - measured canvas size.
		* @param padding - world-independent screen padding in CSS pixels.
		* @returns the viewport that centers the content.
		*/
		function fitViewport(bounds, size, padding = 48) {
			if (bounds.width <= 0 || bounds.height <= 0) return {
				scale: 1,
				x: padding,
				y: padding
			};
			const availableWidth = Math.max(1, size.width - padding * 2);
			const availableHeight = Math.max(1, size.height - padding * 2);
			const scale = clampScale(Math.min(1.05, availableWidth / bounds.width, availableHeight / bounds.height));
			return {
				scale,
				x: (size.width - bounds.width * scale) / 2 - bounds.minX * scale,
				y: (size.height - bounds.height * scale) / 2 - bounds.minY * scale
			};
		}
		/**
		* Center one node in the reading area, leaving room for the detail sidebar.
		* @param box - the focused node box.
		* @param size - measured canvas size.
		* @returns the focus viewport.
		*/
		function focusViewport(box, size) {
			const scale = clampScale(Math.max(.9, 1));
			const anchorX = size.width * .42;
			const anchorY = size.height * .5;
			return {
				scale,
				x: anchorX - (box.x + box.width / 2) * scale,
				y: anchorY - (box.y + box.height / 2) * scale
			};
		}
		/**
		* Translate one viewport by screen-space deltas.
		* @param viewport - current viewport.
		* @param dx - horizontal drag distance in CSS pixels.
		* @param dy - vertical drag distance in CSS pixels.
		* @returns the translated viewport.
		*/
		function translateViewport(viewport, dx, dy) {
			return {
				scale: viewport.scale,
				x: viewport.x + dx,
				y: viewport.y + dy
			};
		}
		/**
		* Zoom around one screen anchor so the world point under it stays fixed.
		* @param viewport - current viewport.
		* @param factor - multiplicative zoom factor.
		* @param anchorX - anchor x in canvas CSS pixels.
		* @param anchorY - anchor y in canvas CSS pixels.
		* @returns the zoomed viewport.
		*/
		function zoomViewport(viewport, factor, anchorX, anchorY) {
			const scale = clampScale(viewport.scale * factor);
			const ratio = scale / viewport.scale;
			return {
				scale,
				x: anchorX - (anchorX - viewport.x) * ratio,
				y: anchorY - (anchorY - viewport.y) * ratio
			};
		}
		/**
		* Screen-space SVG transform of one viewport.
		* @param viewport - current viewport.
		* @returns the SVG transform attribute value.
		*/
		function viewportTransform(viewport) {
			return `translate(${round(viewport.x)} ${round(viewport.y)}) scale(${round(viewport.scale)})`;
		}
		/** Round a coordinate for a stable attribute string. */
		function round(value) {
			return Math.round(value * 1e3) / 1e3;
		}
		/**
		* Build the cubic edge path between two node boxes with its label anchor.
		* @param from - source box.
		* @param to - target box.
		* @returns path data and the midpoint label anchor.
		*/
		function edgeGeometry(from, to) {
			const fromCenterX = from.x + from.width / 2;
			const fromCenterY = from.y + from.height / 2;
			const toCenterX = to.x + to.width / 2;
			const toCenterY = to.y + to.height / 2;
			if (Math.abs(fromCenterX - toCenterX) < 24 && to.y >= from.y) {
				const x1 = fromCenterX;
				const y1 = from.y + from.height;
				const x2 = toCenterX;
				const y2 = to.y;
				return {
					path: `M ${round(x1)} ${round(y1)} C ${round(x1)} ${round(y1 + 42)}, ${round(x2)} ${round(y2 - 42)}, ${round(x2)} ${round(y2)}`,
					labelX: (x1 + x2) / 2,
					labelY: (y1 + y2) / 2
				};
			}
			const x1 = from.x + from.width;
			const y1 = fromCenterY;
			const x2 = to.x;
			const y2 = toCenterY;
			const bend = Math.max(40, Math.min(180, Math.abs(x2 - x1) * .45));
			return {
				path: `M ${round(x1)} ${round(y1)} C ${round(x1 + bend)} ${round(y1)}, ${round(x2 - bend)} ${round(y2)}, ${round(x2)} ${round(y2)}`,
				labelX: round((x1 + x2) / 2),
				labelY: round((y1 + y2) / 2)
			};
		}
		/** Split one label into lines of at most `maxChars` characters (word-aware for ASCII). */
		/**
		* Split one label into lines of at most maxChars characters (word-aware for ASCII).
		* @param text - source label text.
		* @param maxChars - maximum characters per line.
		* @returns the wrapped lines in source order.
		*/
		function wrapLabel(text, maxChars) {
			const normalized = text.replace(/\s+/gu, " ").trim();
			if (normalized.length <= maxChars) return [normalized];
			const lines = [];
			let current = "";
			for (const token of normalized.split(" ")) {
				const candidate = current === "" ? token : `${current} ${token}`;
				if (candidate.length <= maxChars) {
					current = candidate;
					continue;
				}
				if (current !== "") lines.push(current);
				if (token.length <= maxChars) {
					current = token;
					continue;
				}
				let rest = token;
				while (rest.length > maxChars) {
					lines.push(rest.slice(0, maxChars));
					rest = rest.slice(maxChars);
				}
				current = rest;
			}
			if (current !== "") lines.push(current);
			return lines;
		}
		//#endregion
		//#region lib/types/client/data/persist.js
		/** Storage-key prefix; the Session id suffix makes the layout project/session-scoped. */
		const STORAGE_KEY_PREFIX = "dsh-client-ui-project-space:v1:";
		/** Largest number of node positions a persisted layout keeps. */
		const MAX_POSITIONS = 2e3;
		/** The browser `localStorage`, or undefined when the document forbids access. */
		/**
		* Resolve the browser localStorage when the document permits access.
		* @returns the storage face, or undefined in a restricted document.
		*/
		function browserStorage() {
			try {
				return typeof localStorage === "undefined" ? void 0 : localStorage;
			} catch {
				return;
			}
		}
		/** Per-Session storage key. */
		/**
		* Per-Session storage key for the persisted canvas layout.
		* @param sessionId - Lead Session id owning the layout.
		* @returns the localStorage key.
		*/
		function projectSpaceStorageKey(sessionId) {
			return `${STORAGE_KEY_PREFIX}${sessionId}`;
		}
		/** Validate one persisted viewport value. */
		/**
		* Validate one persisted viewport value.
		* @param value - parsed JSON value.
		* @returns the validated viewport, or null for malformed input.
		*/
		function parseViewport(value) {
			if (typeof value !== "object" || value === null) return null;
			const candidate = value;
			if (typeof candidate.scale !== "number" || typeof candidate.x !== "number" || typeof candidate.y !== "number") return null;
			if (!Number.isFinite(candidate.scale) || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return null;
			return {
				scale: clampScale(candidate.scale),
				x: candidate.x,
				y: candidate.y
			};
		}
		/** Validate one persisted position table. */
		/**
		* Validate one persisted position table.
		* @param value - parsed JSON value.
		* @returns the validated positions, or null for malformed input.
		*/
		function parsePositions(value) {
			if (typeof value !== "object" || value === null) return null;
			const positions = {};
			let count = 0;
			for (const [id, position] of Object.entries(value)) {
				if (!isPosition(position)) continue;
				positions[id] = [position[0], position[1]];
				count += 1;
				if (count >= MAX_POSITIONS) break;
			}
			return positions;
		}
		/**
		* Parse one raw storage value into a view, ignoring malformed content.
		* @param raw - raw JSON string or null.
		* @returns the stored view, or null when the value is absent or invalid.
		*/
		function parseStoredView(raw) {
			if (raw === null) return null;
			let parsed;
			try {
				parsed = JSON.parse(raw);
			} catch {
				return null;
			}
			if (typeof parsed !== "object" || parsed === null) return null;
			const candidate = parsed;
			const positions = parsePositions(candidate.positions ?? {});
			if (positions === null) return null;
			return {
				positions,
				viewport: parseViewport(candidate.viewport ?? null)
			};
		}
		/**
		* Read one Session's persisted layout.
		* @param storage - storage face, or undefined in a restricted document.
		* @param sessionId - Lead Session id owning the layout.
		* @returns the stored view, or null.
		*/
		function readStoredView(storage, sessionId) {
			if (storage === void 0) return null;
			try {
				return parseStoredView(storage.getItem(projectSpaceStorageKey(sessionId)));
			} catch {
				return null;
			}
		}
		/**
		* Persist one Session's layout.
		* @param storage - storage face, or undefined in a restricted document.
		* @param sessionId - Lead Session id owning the layout.
		* @param view - positions and viewport to persist.
		* @returns whether the write succeeded.
		*/
		function writeStoredView(storage, sessionId, view) {
			if (storage === void 0) return false;
			try {
				const positions = {};
				let count = 0;
				for (const [id, position] of Object.entries(view.positions)) {
					if (!isPosition(position)) continue;
					positions[id] = [position[0], position[1]];
					count += 1;
					if (count >= MAX_POSITIONS) break;
				}
				storage.setItem(projectSpaceStorageKey(sessionId), JSON.stringify({
					positions,
					viewport: view.viewport
				}));
				return true;
			} catch {
				return false;
			}
		}
		/** Element tags and roles that own native keyboard behavior. */
		const EDITABLE_TAGS = new Set([
			"INPUT",
			"TEXTAREA",
			"SELECT"
		]);
		/**
		* Whether a key event target would lose native typing behavior to a view shortcut.
		* @param target - event target.
		* @returns true inside inputs, editable regions, or an open dialog.
		*/
		function isShortcutBlockedTarget(target) {
			if (target === null || typeof target.closest !== "function") return typeof document !== "undefined" && document.querySelector("dialog[open]") !== null;
			const element = target;
			if (EDITABLE_TAGS.has(element.tagName)) return true;
			if (element.closest("[contenteditable=\"true\"], [contenteditable=\"\"], [role=\"dialog\"], dialog[open]") !== null) return true;
			return typeof document !== "undefined" && document.querySelector("dialog[open]") !== null;
		}
		/**
		* Route one keydown to the canvas shortcuts.
		* @param event - the key event.
		* @returns the intent, or null when the event is not a bare canvas shortcut.
		*/
		function viewShortcut(event) {
			if (event.ctrlKey || event.metaKey || event.altKey) return null;
			if (isShortcutBlockedTarget(event.target)) return null;
			if (event.key === "Escape") return "escape";
			if (event.key === "f" || event.key === "F") return "fit";
			return null;
		}
		//#endregion
		//#region lib/types/client/GraphCanvas.js
		/** React + SVG workflow canvas: pan, zoom, drag, selection, focus, and fit. */
		/** Move distance below which a pointer gesture is a click, not a drag. */
		const DRAG_THRESHOLD = 4;
		/** Approximate rendered text width for edge labels. */
		function labelWidth(text) {
			let width = 0;
			for (const character of text) width += character.codePointAt(0) !== void 0 && character.codePointAt(0) > 255 ? 13 : 7.5;
			return width;
		}
		/** One node's primary and secondary copy. */
		function nodeCopy(node, t, taskCount) {
			switch (node.kind) {
				case "goal": return {
					title: node.goalState === "set" ? node.objective ?? t("shell.goalMissing") : node.goalState === "unset" ? t("shell.goalMissing") : t("shell.goalUnavailable"),
					meta: node.goalState === "set" ? [goalPhaseLabel(t, node.phase ?? "active"), node.roundsStarted === null || node.maxGoalRounds === null ? t("detail.goal") : t("goal.rounds", {
						started: node.roundsStarted,
						max: node.maxGoalRounds
					})] : [t("detail.goal")]
				};
				case "lead": return {
					title: node.name,
					meta: [runtimeLabel(t, node.runtime), t("detail.relations", { count: taskCount })]
				};
				case "member": return {
					title: node.name,
					meta: [runtimeLabel(t, node.runtime), t("count.tasks", { count: node.taskCount })]
				};
				case "task": return {
					title: node.subject,
					meta: [taskStatusLabel(t, node.status), node.ownerName ?? t("task.ownerUnknown")]
				};
				case "result": return {
					title: node.title,
					meta: [t("detail.author") + ": " + node.authorName, t("detail.revision", { revision: node.revision })]
				};
			}
		}
		/** One card inside the canvas. */
		function CanvasNode({ node, box, selected, highlighted, dimmed, taskCount, t }) {
			const copy = nodeCopy(node, t, taskCount);
			const lines = wrapLabel(copy.title, node.kind === "result" ? 20 : 18).slice(0, 3);
			const pendingCount = node.kind === "member" || node.kind === "task" || node.kind === "result" ? node.pendingCount : 0;
			const aria = t("node.aria", {
				kind: nodeKindLabel(t, node.kind),
				title: copy.title
			});
			return (0, react_jsx_runtime.jsxs)("g", {
				className: cx(project_space_module_css_default.node, dimmed && project_space_module_css_default.nodeDimmed),
				"data-node-id": node.id,
				"data-node-kind": node.kind,
				"data-node-x": Math.round(box.x),
				"data-node-y": Math.round(box.y),
				transform: "translate(" + box.x + " " + box.y + ")",
				role: "button",
				tabIndex: -1,
				"aria-label": aria,
				"aria-pressed": selected,
				children: [
					(0, react_jsx_runtime.jsx)("rect", {
						className: cx(project_space_module_css_default.nodeCard, project_space_module_css_default["node_" + node.kind], highlighted && project_space_module_css_default.nodeHighlighted),
						width: box.width,
						height: box.height,
						rx: 10
					}),
					selected && (0, react_jsx_runtime.jsx)("rect", {
						className: project_space_module_css_default.nodeSelectedRing,
						x: -4,
						y: -4,
						width: box.width + 8,
						height: box.height + 8,
						rx: 13,
						"data-selected-ring": ""
					}),
					pendingCount > 0 && (0, react_jsx_runtime.jsxs)("g", {
						"data-attention": "",
						children: [
							(0, react_jsx_runtime.jsx)("rect", {
								className: project_space_module_css_default.nodeAttentionLine,
								width: 4,
								height: box.height - 16,
								x: 0,
								y: 8,
								rx: 2
							}),
							(0, react_jsx_runtime.jsx)("rect", {
								className: project_space_module_css_default.nodeAttentionBadge,
								x: box.width - 82,
								y: 10,
								width: 72,
								height: 22,
								rx: 5
							}),
							(0, react_jsx_runtime.jsx)("text", {
								className: project_space_module_css_default.nodeAttentionBadgeText,
								x: box.width - 74,
								y: 25,
								children: t("attention.count", { count: pendingCount })
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("text", {
						className: project_space_module_css_default.nodeKicker,
						x: 14,
						y: 26,
						children: nodeKindLabel(t, node.kind)
					}),
					lines.map((line, index) => (0, react_jsx_runtime.jsx)("text", {
						className: project_space_module_css_default.nodeTitle,
						x: 14,
						y: 48 + index * 18,
						children: line
					}, line + ":" + index)),
					copy.meta.filter((line) => line.length > 0).slice(0, 2).map((line, index) => (0, react_jsx_runtime.jsx)("text", {
						className: project_space_module_css_default.nodeMeta,
						x: 14,
						y: box.height - 26 + index * 14,
						children: line
					}, line + ":" + index))
				]
			});
		}
		/**
		* Render the interactive workflow canvas. Positions and the viewport persist
		* per Session; a projection update only places genuinely new nodes, so the
		* visible layout and viewport never jump on a subscription frame.
		* @param props - model, selection, persisted view, and persistence callback.
		* @returns the canvas frame with its SVG scene.
		*/
		const GraphCanvas = (0, react.forwardRef)(function GraphCanvas({ model, selectedId, highlight, detailOpen, initialView, t, onSelect, onPersist }, ref) {
			const frameRef = (0, react.useRef)(null);
			const svgRef = (0, react.useRef)(null);
			const [size, setSize] = (0, react.useState)(DEFAULT_CANVAS_SIZE);
			const [positions, setPositions] = (0, react.useState)(initialView?.positions ?? {});
			const [viewport, setViewport] = (0, react.useState)(initialView?.viewport ?? null);
			const [dragOverride, setDragOverride] = (0, react.useState)(null);
			const gestureRef = (0, react.useRef)(null);
			const dragOverrideRef = (0, react.useRef)(null);
			const focusOriginRef = (0, react.useRef)(null);
			const autoFitRef = (0, react.useRef)(initialView?.viewport !== null && initialView?.viewport !== void 0);
			const positionsRef = (0, react.useRef)(positions);
			positionsRef.current = positions;
			const viewportRef = (0, react.useRef)(viewport);
			viewportRef.current = viewport;
			const patternId = (0, react.useId)().replace(/:/gu, "");
			const mergedPositions = (0, react.useMemo)(() => {
				const layout = layoutPositions(model, positions);
				if (dragOverride === null) return layout;
				return {
					...layout,
					[dragOverride.id]: dragOverride.position
				};
			}, [
				dragOverride,
				model,
				positions
			]);
			const boxes = (0, react.useMemo)(() => nodeBoxes(model, mergedPositions), [mergedPositions, model]);
			const boxById = (0, react.useMemo)(() => new Map(boxes.map((box) => [box.id, box])), [boxes]);
			const geometries = (0, react.useMemo)(() => {
				const map = /* @__PURE__ */ new Map();
				for (const edge of model.edges) {
					const from = boxById.get(edge.from);
					const to = boxById.get(edge.to);
					if (from === void 0 || to === void 0) continue;
					map.set(edge.id, edgeGeometry(from, to));
				}
				return map;
			}, [boxById, model.edges]);
			(0, react.useEffect)(() => {
				const frame = frameRef.current;
				if (frame === null) return void 0;
				const measure = () => {
					const width = frame.clientWidth > 0 ? frame.clientWidth : DEFAULT_CANVAS_SIZE.width;
					const height = frame.clientHeight > 0 ? frame.clientHeight : DEFAULT_CANVAS_SIZE.height;
					setSize((current) => current.width === width && current.height === height ? current : {
						width,
						height
					});
				};
				measure();
				if (typeof ResizeObserver === "undefined") return void 0;
				const observer = new ResizeObserver(measure);
				observer.observe(frame);
				return () => {
					observer.disconnect();
				};
			}, []);
			const persist = (0, react.useCallback)((nextPositions, nextViewport) => {
				const stored = {};
				for (const [id, position] of Object.entries(nextPositions)) if (isPosition(position)) stored[id] = [position[0], position[1]];
				onPersist({
					positions: stored,
					viewport: nextViewport
				});
			}, [onPersist]);
			const fit = (0, react.useCallback)(() => {
				const bounds = contentBounds(boxes);
				if (bounds === null) return;
				const next = fitViewport(bounds, size);
				setViewport(next);
				persist(positionsRef.current, next);
			}, [
				boxes,
				persist,
				size
			]);
			(0, react.useEffect)(() => {
				if (autoFitRef.current || boxes.length === 0) return;
				autoFitRef.current = true;
				const bounds = contentBounds(boxes);
				if (bounds === null) return;
				setViewport((current) => current ?? fitViewport(bounds, size));
			}, [boxes, size]);
			const tidy = (0, react.useCallback)(() => {
				const nextPositions = layoutPositions(model, {});
				setPositions(nextPositions);
				const bounds = contentBounds(nodeBoxes(model, nextPositions));
				if (bounds === null) return;
				const next = fitViewport(bounds, size);
				setViewport(next);
				persist(nextPositions, next);
			}, [
				model,
				persist,
				size
			]);
			const focusNode = (0, react.useCallback)((nodeId) => {
				const box = boxById.get(nodeId);
				if (box === void 0) return;
				const current = viewportRef.current;
				if (focusOriginRef.current === null && current !== null) focusOriginRef.current = current;
				const next = focusViewport(box, size);
				setViewport(next);
				persist(positionsRef.current, next);
			}, [
				boxById,
				persist,
				size
			]);
			const restoreFocus = (0, react.useCallback)(() => {
				const origin = focusOriginRef.current;
				if (origin === null) return false;
				focusOriginRef.current = null;
				setViewport(origin);
				persist(positionsRef.current, origin);
				return true;
			}, [persist]);
			const zoom = (0, react.useCallback)((factor, anchorX, anchorY) => {
				const next = zoomViewport(viewportRef.current ?? {
					scale: 1,
					x: 0,
					y: 0
				}, factor, anchorX ?? size.width / 2, anchorY ?? size.height / 2);
				setViewport(next);
				persist(positionsRef.current, next);
			}, [persist, size]);
			(0, react.useImperativeHandle)(ref, () => ({
				fit,
				tidy,
				focusNode,
				restoreFocus,
				zoom: (factor) => {
					zoom(factor);
				}
			}), [
				fit,
				tidy,
				focusNode,
				restoreFocus,
				zoom
			]);
			(0, react.useEffect)(() => {
				const svg = svgRef.current;
				if (svg === null) return void 0;
				const onWheel = (event) => {
					event.preventDefault();
					const rect = svg.getBoundingClientRect();
					zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
				};
				svg.addEventListener("wheel", onWheel, { passive: false });
				return () => {
					svg.removeEventListener("wheel", onWheel);
				};
			}, [zoom]);
			const startPan = (event) => {
				if (event.button !== 0 || viewport === null) return;
				const target = event.target;
				if (target.closest("[data-node-id]") !== null || target.closest("[data-edge-id]") !== null) return;
				gestureRef.current = {
					kind: "pan",
					pointerId: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					origin: viewport,
					moved: false
				};
				try {
					event.currentTarget.setPointerCapture(event.pointerId);
				} catch {}
			};
			const startNodeDrag = (event, node) => {
				if (event.button !== 0 || viewport === null) return;
				event.stopPropagation();
				const origin = mergedPositions[node.id];
				if (!isPosition(origin)) return;
				gestureRef.current = {
					kind: "node",
					pointerId: event.pointerId,
					nodeId: node.id,
					startX: event.clientX,
					startY: event.clientY,
					origin,
					originScale: viewport.scale,
					moved: false
				};
				try {
					event.currentTarget.setPointerCapture(event.pointerId);
				} catch {}
			};
			const moveGesture = (event) => {
				const gesture = gestureRef.current;
				if (gesture === null || gesture.pointerId !== event.pointerId) return;
				const dx = event.clientX - gesture.startX;
				const dy = event.clientY - gesture.startY;
				if (!gesture.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
				gesture.moved = true;
				if (gesture.kind === "pan") {
					setViewport(translateViewport(gesture.origin, dx, dy));
					return;
				}
				const nextOverride = {
					id: gesture.nodeId,
					position: [gesture.origin[0] + dx / gesture.originScale, gesture.origin[1] + dy / gesture.originScale]
				};
				dragOverrideRef.current = nextOverride;
				setDragOverride(nextOverride);
			};
			const endGesture = (event) => {
				const gesture = gestureRef.current;
				if (gesture === null || gesture.pointerId !== event.pointerId) return;
				gestureRef.current = null;
				try {
					event.currentTarget.releasePointerCapture(event.pointerId);
				} catch {}
				if (gesture.kind === "pan") {
					if (gesture.moved && viewportRef.current !== null) persist(positionsRef.current, viewportRef.current);
					return;
				}
				const override = dragOverrideRef.current;
				dragOverrideRef.current = null;
				if (gesture.moved && override !== null) {
					const nextPositions = {
						...positionsRef.current,
						[gesture.nodeId]: override.position
					};
					setPositions(nextPositions);
					setDragOverride(null);
					persist(nextPositions, viewportRef.current);
					return;
				}
				setDragOverride(null);
				onSelect(gesture.nodeId);
			};
			const cancelGesture = () => {
				if (gestureRef.current === null) return;
				gestureRef.current = null;
				dragOverrideRef.current = null;
				setDragOverride(null);
			};
			const selectionActive = selectedId !== null;
			const transform = viewportTransform(viewport ?? {
				scale: 1,
				x: 0,
				y: 0
			});
			const taskCount = model.tasks.length;
			return (0, react_jsx_runtime.jsx)("div", {
				className: cx(project_space_module_css_default.canvasFrame, detailOpen && project_space_module_css_default.canvasFrameWithDetail),
				"data-graph-canvas-frame": "",
				ref: frameRef,
				children: (0, react_jsx_runtime.jsxs)("svg", {
					ref: svgRef,
					className: project_space_module_css_default.canvas,
					role: "group",
					"aria-label": t("canvas.aria"),
					"data-project-space-canvas": "",
					onPointerDown: startPan,
					onPointerMove: moveGesture,
					onPointerUp: endGesture,
					onPointerCancel: cancelGesture,
					children: [
						(0, react_jsx_runtime.jsx)("defs", { children: (0, react_jsx_runtime.jsx)("pattern", {
							id: patternId + "-dots",
							width: 24,
							height: 24,
							patternUnits: "userSpaceOnUse",
							children: (0, react_jsx_runtime.jsx)("circle", {
								className: project_space_module_css_default.canvasDot,
								cx: 1,
								cy: 1,
								r: 1
							})
						}) }),
						(0, react_jsx_runtime.jsx)("rect", {
							className: project_space_module_css_default.canvasBackground,
							width: "100%",
							height: "100%",
							fill: "url(#" + patternId + "-dots)"
						}),
						(0, react_jsx_runtime.jsxs)("g", {
							transform,
							"data-viewport": "",
							"data-viewport-transform": transform,
							children: [model.edges.map((edge) => {
								const geometry = geometries.get(edge.id);
								if (geometry === void 0) return null;
								const dimmed = selectionActive && !highlight.edgeIds.has(edge.id);
								const emphasized = selectionActive && highlight.edgeIds.has(edge.id);
								const label = edgeLabel(t, edge.kind);
								const showLabel = edge.kind === "goal-lead" || edge.kind === "delegate" || emphasized;
								const to = boxById.get(edge.to);
								return (0, react_jsx_runtime.jsxs)("g", {
									"data-edge-id": edge.id,
									"data-edge-kind": edge.kind,
									children: [
										(0, react_jsx_runtime.jsx)("path", {
											className: cx(project_space_module_css_default.edge, project_space_module_css_default["edge_" + edge.kind], dimmed && project_space_module_css_default.edgeDimmed, emphasized && project_space_module_css_default.edgeHighlighted),
											d: geometry.path,
											fill: "none"
										}),
										(0, react_jsx_runtime.jsx)("path", {
											className: project_space_module_css_default.edgeHit,
											d: geometry.path,
											fill: "none",
											onPointerDown: (event) => {
												event.stopPropagation();
												onSelect(edge.id);
											}
										}),
										to !== void 0 && (0, react_jsx_runtime.jsx)("polygon", {
											className: cx(project_space_module_css_default.edgeArrow, dimmed && project_space_module_css_default.edgeDimmed, emphasized && project_space_module_css_default.edgeHighlighted),
											points: to.x + "," + (to.y + to.height / 2) + " " + (to.x - 8) + "," + (to.y + to.height / 2 - 4) + " " + (to.x - 8) + "," + (to.y + to.height / 2 + 4)
										}),
										showLabel && (0, react_jsx_runtime.jsxs)("g", {
											"data-edge-label": "",
											className: cx(project_space_module_css_default.edgeLabel, dimmed && project_space_module_css_default.edgeLabelDimmed),
											children: [(0, react_jsx_runtime.jsx)("rect", {
												className: project_space_module_css_default.edgeLabelBackground,
												x: geometry.labelX - labelWidth(label) / 2 - 6,
												y: geometry.labelY - 11,
												width: labelWidth(label) + 12,
												height: 22,
												rx: 4
											}), (0, react_jsx_runtime.jsx)("text", {
												className: project_space_module_css_default.edgeLabelText,
												x: geometry.labelX,
												y: geometry.labelY + 4,
												textAnchor: "middle",
												children: label
											})]
										})
									]
								}, edge.id);
							}), [
								...model.goal === null ? [] : [model.goal],
								...model.lead === null ? [] : [model.lead],
								...model.members,
								...model.tasks,
								...model.results
							].map((node) => {
								const box = boxById.get(node.id);
								if (box === void 0) return null;
								return (0, react_jsx_runtime.jsx)("g", {
									onPointerDown: (event) => {
										startNodeDrag(event, node);
									},
									children: (0, react_jsx_runtime.jsx)(CanvasNode, {
										node,
										box,
										selected: selectedId === node.id,
										highlighted: !selectionActive || highlight.nodeIds.has(node.id),
										dimmed: selectionActive && !highlight.nodeIds.has(node.id),
										taskCount,
										t
									})
								}, node.id);
							})]
						})
					]
				})
			});
		});
		//#endregion
		//#region lib/types/client/AttentionDock.js
		/**
		* Render the attention strip. The strip is derived data only: opening a detail
		* or selecting a node never clears an item; a new Lead record revision that
		* drops the pending id removes it.
		* @param props - attention items, copy seat, and locate handler.
		* @returns the dock section.
		*/
		function AttentionDock({ items, t, onLocate }) {
			const hasItems = items.length > 0;
			return (0, react_jsx_runtime.jsxs)("section", {
				className: cx(project_space_module_css_default.attention, !hasItems && project_space_module_css_default.attentionClear),
				"aria-label": t("attention.title"),
				"data-attention-count": items.length,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: project_space_module_css_default.attentionHead,
					children: [
						(0, react_jsx_runtime.jsx)("span", {
							className: project_space_module_css_default.attentionDot,
							"aria-hidden": "true"
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: project_space_module_css_default.attentionTitle,
							children: t("attention.title")
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: project_space_module_css_default.attentionCount,
							"data-attention-badge": items.length,
							children: t("attention.count", { count: items.length })
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: project_space_module_css_default.attentionHint,
							children: t("attention.hint")
						})
					]
				}), hasItems ? (0, react_jsx_runtime.jsx)("ul", {
					className: project_space_module_css_default.attentionItems,
					children: items.map((item) => (0, react_jsx_runtime.jsx)("li", { children: (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: project_space_module_css_default.attentionItem,
						"aria-label": t("attention.locate", { text: item.text }),
						onClick: () => {
							onLocate(item);
						},
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: project_space_module_css_default.attentionItemText,
							children: item.text
						}), (0, react_jsx_runtime.jsx)("span", {
							className: project_space_module_css_default.attentionItemMeta,
							children: t("attention.record", {
								title: item.recordTitle,
								revision: item.recordRevision
							})
						})]
					}) }, item.id))
				}) : (0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.attentionEmpty,
					children: t("attention.clear")
				})]
			});
		}
		//#endregion
		//#region lib/types/client/DetailPanel.js
		/** One label/value row. */
		function Field({ label, children }) {
			return (0, react_jsx_runtime.jsxs)("div", {
				className: project_space_module_css_default.field,
				children: [(0, react_jsx_runtime.jsx)("dt", {
					className: project_space_module_css_default.fieldLabel,
					children: label
				}), (0, react_jsx_runtime.jsx)("dd", {
					className: project_space_module_css_default.fieldValue,
					children
				})]
			});
		}
		/** Node-linked list button. */
		function NodeLink({ id, label, onSelect }) {
			return (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: project_space_module_css_default.nodeLink,
				onClick: () => {
					onSelect(id);
				},
				children: label
			});
		}
		/** Member copy shared by the Lead and member branches. */
		function PersonDetail({ node, model, t, onSelect }) {
			const memberId = node.id;
			const owned = model.tasks.filter((task) => task.ownerMemberId === memberId);
			const records = node.kind === "lead" ? model.results : model.results.filter((result) => {
				const viaMember = result.memberSessionIds.some((sessionId) => "member:" + sessionId === memberId);
				const viaTask = result.taskIds.some((taskId) => owned.some((task) => task.taskId === taskId));
				return viaMember || viaTask;
			});
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)(Field, {
					label: t("detail.lifecycle"),
					children: node.lifecycle
				}),
				(0, react_jsx_runtime.jsx)(Field, {
					label: t("detail.runtime"),
					children: runtimeLabel(t, node.runtime)
				}),
				(0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.hint,
					children: t("detail.runtimeHint")
				}),
				(0, react_jsx_runtime.jsx)("h4", {
					className: project_space_module_css_default.sectionHeading,
					children: t("detail.tasksOwned")
				}),
				owned.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.mutedText,
					children: t("summary.tasksNone")
				}) : (0, react_jsx_runtime.jsx)("ul", {
					className: project_space_module_css_default.linkList,
					children: owned.map((task) => (0, react_jsx_runtime.jsx)("li", { children: (0, react_jsx_runtime.jsx)(NodeLink, {
						id: task.id,
						label: task.subject,
						onSelect
					}) }, task.id))
				}),
				(0, react_jsx_runtime.jsx)("h4", {
					className: project_space_module_css_default.sectionHeading,
					children: t("detail.resultsAssociated")
				}),
				records.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.mutedText,
					children: t("detail.resultsNone")
				}) : (0, react_jsx_runtime.jsx)("ul", {
					className: project_space_module_css_default.linkList,
					children: records.map((record) => (0, react_jsx_runtime.jsx)("li", { children: (0, react_jsx_runtime.jsx)(NodeLink, {
						id: record.id,
						label: t("detail.revision", { revision: record.revision }) + " · " + record.title,
						onSelect
					}) }, record.id))
				})
			] });
		}
		/** Task detail branch. */
		function TaskDetail({ node, model, t, onSelect }) {
			const records = model.results.filter((result) => result.taskIds.includes(node.taskId));
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.detailTitle,
					children: node.subject
				}),
				(0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.detailText,
					children: node.description
				}),
				(0, react_jsx_runtime.jsxs)("dl", {
					className: project_space_module_css_default.fields,
					children: [
						(0, react_jsx_runtime.jsxs)(Field, {
							label: t("detail.status"),
							children: [taskStatusLabel(t, node.status), node.status === "pending" ? " · " + (node.ready ? t("task.ready") : t("task.blocked")) : ""]
						}),
						(0, react_jsx_runtime.jsx)(Field, {
							label: t("detail.lifecycle"),
							children: t("task.revision", { revision: node.revision })
						}),
						(0, react_jsx_runtime.jsx)(Field, {
							label: t("detail.owner"),
							children: node.ownerName === null ? ownerStateLabel(t, node.ownerState) : node.ownerName + (node.ownerState === "ambiguous" ? " · " + ownerStateLabel(t, node.ownerState) : "")
						}),
						node.blockedBy.length > 0 && (0, react_jsx_runtime.jsx)(Field, {
							label: t("label.blockedBy"),
							children: formatIds(node.blockedBy)
						}),
						node.writeScopes.length > 0 && (0, react_jsx_runtime.jsx)(Field, {
							label: t("label.writeScopes"),
							children: formatIds(node.writeScopes)
						}),
						(0, react_jsx_runtime.jsx)(Field, {
							label: t("detail.pending"),
							children: t("count.pending", { count: node.pendingCount })
						})
					]
				}),
				node.ownerMemberId !== null && (0, react_jsx_runtime.jsx)("p", { children: (0, react_jsx_runtime.jsx)(NodeLink, {
					id: node.ownerMemberId,
					label: t("detail.owner"),
					onSelect
				}) }),
				(0, react_jsx_runtime.jsx)("h4", {
					className: project_space_module_css_default.sectionHeading,
					children: t("detail.resultsAssociated")
				}),
				records.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.mutedText,
					children: t("detail.resultsNone")
				}) : (0, react_jsx_runtime.jsx)("ul", {
					className: project_space_module_css_default.linkList,
					children: records.map((record) => (0, react_jsx_runtime.jsx)("li", { children: (0, react_jsx_runtime.jsx)(NodeLink, {
						id: record.id,
						label: t("detail.revision", { revision: record.revision }) + " · " + record.title,
						onSelect
					}) }, record.id))
				})
			] });
		}
		/** Result (collaboration record) detail branch. */
		function ResultDetail({ node, model, sessionId, t, onSelect, sameSessionFocusUnavailable, onOpenSourceSession }) {
			const updated = formatTimestamp(node.updatedTime);
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.detailTitle,
					children: node.title
				}),
				(0, react_jsx_runtime.jsxs)("dl", {
					className: project_space_module_css_default.fields,
					children: [
						(0, react_jsx_runtime.jsx)(Field, {
							label: t("detail.author"),
							children: node.authorName
						}),
						(0, react_jsx_runtime.jsx)(Field, {
							label: t("detail.revision"),
							children: t("detail.revision", { revision: node.revision })
						}),
						(0, react_jsx_runtime.jsx)(Field, {
							label: t("detail.updated"),
							children: updated ?? t("time.unknown")
						}),
						(0, react_jsx_runtime.jsx)(Field, {
							label: t("detail.recordId"),
							children: node.recordId
						})
					]
				}),
				(0, react_jsx_runtime.jsx)("h4", {
					className: project_space_module_css_default.sectionHeading,
					children: t("detail.summary")
				}),
				(0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.detailText,
					children: node.summary
				}),
				(0, react_jsx_runtime.jsx)("h4", {
					className: project_space_module_css_default.sectionHeading,
					children: t("detail.content")
				}),
				(0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.detailText,
					children: node.content
				}),
				(0, react_jsx_runtime.jsx)("h4", {
					className: project_space_module_css_default.sectionHeading,
					children: t("detail.associations")
				}),
				node.associationsProvided ? (0, react_jsx_runtime.jsxs)("dl", {
					className: project_space_module_css_default.fields,
					children: [node.taskIds.length > 0 && (0, react_jsx_runtime.jsx)(Field, {
						label: t("detail.associationsTasks"),
						children: (0, react_jsx_runtime.jsx)("span", {
							className: project_space_module_css_default.linkList,
							children: node.taskIds.map((taskId) => {
								const task = model.tasks.find((candidate) => candidate.taskId === taskId);
								return task === void 0 ? (0, react_jsx_runtime.jsx)("span", {
									className: project_space_module_css_default.mutedText,
									children: taskId
								}, taskId) : (0, react_jsx_runtime.jsx)(NodeLink, {
									id: task.id,
									label: task.subject,
									onSelect
								}, taskId);
							})
						})
					}), node.memberSessionIds.length > 0 && (0, react_jsx_runtime.jsx)(Field, {
						label: t("detail.associationsMembers"),
						children: (0, react_jsx_runtime.jsx)("span", {
							className: project_space_module_css_default.linkList,
							children: node.memberSessionIds.map((memberSessionId) => {
								const member = model.members.find((candidate) => candidate.sessionId === memberSessionId);
								return member === void 0 ? (0, react_jsx_runtime.jsx)("span", {
									className: project_space_module_css_default.mutedText,
									children: memberSessionId
								}, memberSessionId) : (0, react_jsx_runtime.jsx)(NodeLink, {
									id: member.id,
									label: member.name,
									onSelect
								}, member.id);
							})
						})
					})]
				}) : (0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.mutedText,
					children: t("detail.associationsMissing")
				}),
				(0, react_jsx_runtime.jsx)("h4", {
					className: project_space_module_css_default.sectionHeading,
					children: t("detail.pending")
				}),
				node.pending.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.mutedText,
					children: t("detail.pendingNone")
				}) : (0, react_jsx_runtime.jsx)("ul", {
					className: project_space_module_css_default.pendingList,
					children: node.pending.map((item) => (0, react_jsx_runtime.jsx)("li", {
						className: project_space_module_css_default.pendingItem,
						children: item.text
					}, item.id))
				}),
				(0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.hint,
					children: t("detail.pendingHint")
				}),
				(0, react_jsx_runtime.jsx)("h4", {
					className: project_space_module_css_default.sectionHeading,
					children: t("detail.versions")
				}),
				(0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.mutedText,
					children: t("detail.versionsCount", { count: node.versions.length })
				}),
				(0, react_jsx_runtime.jsx)("ul", {
					className: project_space_module_css_default.versionList,
					children: node.versions.map((version) => (0, react_jsx_runtime.jsxs)("li", {
						className: cx(project_space_module_css_default.versionEntry, version.revision === node.revision && project_space_module_css_default.versionCurrent),
						children: [(0, react_jsx_runtime.jsx)("span", { children: t("detail.versionEntry", {
							revision: version.revision,
							seq: version.seq
						}) }), (0, react_jsx_runtime.jsxs)("span", {
							className: project_space_module_css_default.versionMeta,
							children: [version.title, version.pending.length > 0 ? " · " + t("count.pending", { count: version.pending.length }) : ""]
						})]
					}, version.revision))
				}),
				(0, react_jsx_runtime.jsx)("h4", {
					className: project_space_module_css_default.sectionHeading,
					children: t("detail.references")
				}),
				(0, react_jsx_runtime.jsx)(ReferenceList, {
					references: node.references,
					sessionId,
					t,
					onFocus: () => {},
					onOpenSession: onOpenSourceSession,
					sameSessionUnavailable: sameSessionFocusUnavailable,
					noticeKeys: {
						cross: "detail.referenceCrossNotice",
						failed: "detail.referenceFailed"
					}
				}),
				(0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.hint,
					children: t("detail.recordsHint")
				})
			] });
		}
		/** Edge detail branch. */
		function EdgeDetail({ edge, model, t, onSelect }) {
			const title = (id) => {
				if (id === "goal") return model.goal?.objective ?? t("node.goal");
				if (id === "lead") return model.lead?.name ?? t("node.lead");
				const member = model.members.find((candidate) => candidate.id === id);
				if (member !== void 0) return member.name;
				const task = model.tasks.find((candidate) => candidate.id === id);
				if (task !== void 0) return task.subject;
				return model.results.find((candidate) => candidate.id === id)?.title ?? id;
			};
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("p", {
				className: project_space_module_css_default.detailTitle,
				children: edgeLabel(t, edge.kind)
			}), (0, react_jsx_runtime.jsxs)("dl", {
				className: project_space_module_css_default.fields,
				children: [
					(0, react_jsx_runtime.jsx)(Field, {
						label: t("detail.edgeFrom"),
						children: (0, react_jsx_runtime.jsx)(NodeLink, {
							id: edge.from,
							label: title(edge.from),
							onSelect
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: t("detail.edgeTo"),
						children: (0, react_jsx_runtime.jsx)(NodeLink, {
							id: edge.to,
							label: title(edge.to),
							onSelect
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: t("detail.edgeKind"),
						children: edgeLabel(t, edge.kind)
					})
				]
			})] });
		}
		/** Resolve the selected id to a node or edge. */
		function selectionOf(model, selectedId) {
			if (selectedId === null) return {
				node: null,
				edge: null
			};
			return {
				node: [
					...model.goal === null ? [] : [model.goal],
					...model.lead === null ? [] : [model.lead],
					...model.members,
					...model.tasks,
					...model.results
				].find((candidate) => candidate.id === selectedId) ?? null,
				edge: selectedId.startsWith("edge:") ? model.edges.find((candidate) => candidate.id === selectedId) ?? null : null
			};
		}
		/**
		* Render the stable-width detail sidebar. It never clears attention: pending
		* items stay visible here until a new Lead record revision removes them.
		* @param props - selected object, model, and navigation callbacks.
		* @returns the sidebar.
		*/
		function DetailPanel({ model, selectedId, sessionId, t, onClose, onSelect, sameSessionFocusUnavailable, onOpenSourceSession }) {
			const { node, edge } = selectionOf(model, selectedId);
			return (0, react_jsx_runtime.jsxs)("aside", {
				className: project_space_module_css_default.detail,
				"aria-label": t("detail.title"),
				"data-detail-panel": "",
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: project_space_module_css_default.detailHead,
					children: [(0, react_jsx_runtime.jsx)("h3", {
						className: project_space_module_css_default.detailHeading,
						children: t("detail.title")
					}), (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: project_space_module_css_default.detailClose,
						"aria-label": t("detail.close"),
						onClick: onClose,
						children: "×"
					})]
				}), (0, react_jsx_runtime.jsxs)("div", {
					className: project_space_module_css_default.detailBody,
					children: [
						node === null && edge === null && (0, react_jsx_runtime.jsx)("p", {
							className: project_space_module_css_default.mutedText,
							children: t("detail.empty")
						}),
						edge !== null && (0, react_jsx_runtime.jsx)(EdgeDetail, {
							edge,
							model,
							t,
							onSelect
						}),
						node !== null && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							(0, react_jsx_runtime.jsx)("p", {
								className: project_space_module_css_default.detailKicker,
								children: nodeKindLabel(t, node.kind)
							}),
							node.kind === "goal" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("p", {
								className: project_space_module_css_default.detailTitle,
								children: node.goalState === "set" ? node.objective ?? t("shell.goalMissing") : node.goalState === "unset" ? t("shell.goalMissing") : t("shell.goalUnavailable")
							}), (0, react_jsx_runtime.jsxs)("dl", {
								className: project_space_module_css_default.fields,
								children: [
									(0, react_jsx_runtime.jsx)(Field, {
										label: t("detail.lifecycle"),
										children: node.phase === null ? t("common.none") : goalPhaseLabel(t, node.phase)
									}),
									node.roundsStarted !== null && node.maxGoalRounds !== null && (0, react_jsx_runtime.jsx)(Field, {
										label: t("label.rounds"),
										children: t("goal.rounds", {
											started: node.roundsStarted,
											max: node.maxGoalRounds
										})
									}),
									node.revision !== null && (0, react_jsx_runtime.jsx)(Field, {
										label: t("detail.revision"),
										children: t("detail.revision", { revision: node.revision })
									})
								]
							})] }),
							(node.kind === "lead" || node.kind === "member") && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("p", {
								className: project_space_module_css_default.detailTitle,
								children: node.name
							}), (0, react_jsx_runtime.jsx)(PersonDetail, {
								node,
								model,
								t,
								onSelect
							})] }),
							node.kind === "task" && (0, react_jsx_runtime.jsx)(TaskDetail, {
								node,
								model,
								t,
								onSelect
							}),
							node.kind === "result" && (0, react_jsx_runtime.jsx)(ResultDetail, {
								node,
								model,
								sessionId,
								t,
								onSelect,
								sameSessionFocusUnavailable,
								onOpenSourceSession
							})
						] })
					]
				})]
			});
		}
		//#endregion
		//#region lib/types/client/WorkflowView.js
		/** Workflow conversation view: graph first, blue attention strip, on-demand detail. */
		/** Explicit availability copy for a view without ready Team data. */
		function StateNotice({ phase, errorMessage, t }) {
			if (phase === "loading") return (0, react_jsx_runtime.jsx)("div", {
				className: project_space_module_css_default.stateNotice,
				"data-project-space-empty": "",
				role: "status",
				children: (0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.stateTitle,
					children: t("shell.loading")
				})
			});
			if (phase === "error") return (0, react_jsx_runtime.jsx)("div", {
				className: project_space_module_css_default.stateNotice,
				"data-project-space-empty": "",
				role: "alert",
				children: (0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.stateTitle,
					children: t("shell.projectionError", { message: errorMessage ?? t("shell.projectionUnknownError") })
				})
			});
			return (0, react_jsx_runtime.jsxs)("div", {
				className: project_space_module_css_default.stateNotice,
				"data-project-space-empty": "",
				role: "status",
				children: [(0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.stateTitle,
					children: t("shell.teamAbsent")
				}), (0, react_jsx_runtime.jsx)("p", {
					className: project_space_module_css_default.stateBody,
					children: t("shell.teamAbsentHint")
				})]
			});
		}
		/**
		* Render the workflow graph view. The view owns selection and detail visibility;
		* the canvas owns layout and persists them per Session. Shortcuts never fire
		* inside inputs, editable regions, or dialogs.
		* @param props - conversation view props plus the injected Session-opening action.
		* @returns the workflow view.
		*/
		function WorkflowView(props) {
			const { sessionId, t, viewRequest, completeViewRequest, openSourceSession } = props;
			const model = useProjectSpaceModel(props);
			const [selectedId, setSelectedId] = (0, react.useState)(null);
			const [detailOpen, setDetailOpen] = (0, react.useState)(false);
			const [initialView] = (0, react.useState)(() => readStoredView(browserStorage(), sessionId));
			const canvasRef = (0, react.useRef)(null);
			const select = (0, react.useCallback)((id) => {
				setSelectedId(id);
				setDetailOpen(id !== null);
			}, []);
			const persist = (0, react.useCallback)((view) => {
				writeStoredView(browserStorage(), sessionId, view);
			}, [sessionId]);
			const locate = (0, react.useCallback)((item) => {
				setSelectedId(item.recordNodeId);
				setDetailOpen(true);
				canvasRef.current?.focusNode(item.recordNodeId);
			}, []);
			(0, react.useEffect)(() => {
				const onKeyDown = (event) => {
					const shortcut = viewShortcut(event);
					if (shortcut === null) return;
					if (shortcut === "fit") {
						event.preventDefault();
						canvasRef.current?.fit();
						return;
					}
					event.preventDefault();
					if (!(canvasRef.current?.restoreFocus() ?? false)) setDetailOpen(false);
				};
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("keydown", onKeyDown);
				};
			}, []);
			(0, react.useEffect)(() => {
				if (viewRequest === null || viewRequest.view !== "workflow") return;
				if (viewRequest.focus.startsWith("node:")) {
					const nodeId = viewRequest.focus.slice(5);
					setSelectedId(nodeId);
					setDetailOpen(true);
					canvasRef.current?.focusNode(nodeId);
				}
				completeViewRequest();
			}, [completeViewRequest, viewRequest]);
			const highlight = selectionPath(model, selectedId);
			const goalText = model.goal === null ? t("shell.goalUnavailable") : model.goal.goalState === "set" ? model.goal.objective ?? t("shell.goalMissing") : model.goal.goalState === "unset" ? t("shell.goalMissing") : t("shell.goalUnavailable");
			const goalMeta = model.goal !== null && model.goal.goalState === "set" && model.goal.phase !== null ? goalPhaseLabel(t, model.goal.phase) : null;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: project_space_module_css_default.root,
				"data-conversation-composer-overlay": "",
				"data-project-space-view": "workflow",
				"data-project-space-state": model.phase,
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: project_space_module_css_default.topbar,
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: project_space_module_css_default.goalSummary,
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: project_space_module_css_default.topbarKicker,
										children: t("detail.goal")
									}),
									(0, react_jsx_runtime.jsx)("span", {
										className: project_space_module_css_default.goalText,
										title: goalText,
										children: goalText
									}),
									goalMeta !== null && (0, react_jsx_runtime.jsx)("span", {
										className: project_space_module_css_default.goalMeta,
										children: goalMeta
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: project_space_module_css_default.counts,
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: project_space_module_css_default.countChip,
										children: t("count.members", { count: model.counts.members })
									}),
									(0, react_jsx_runtime.jsx)("span", {
										className: project_space_module_css_default.countChip,
										children: t("count.tasks", { count: model.counts.tasks })
									}),
									(0, react_jsx_runtime.jsx)("span", {
										className: project_space_module_css_default.countChip,
										children: t("count.records", { count: model.counts.results })
									}),
									model.counts.pending > 0 && (0, react_jsx_runtime.jsx)("span", {
										className: project_space_module_css_default.pendingChip,
										"data-pending-chip": model.counts.pending,
										children: t("count.pending", { count: model.counts.pending })
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: project_space_module_css_default.toolbar,
								children: [
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: project_space_module_css_default.toolButton,
										"data-action": "fit",
										title: t("toolbar.fit"),
										onClick: () => {
											canvasRef.current?.fit();
										},
										children: t("toolbar.fit")
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: project_space_module_css_default.toolButton,
										"data-action": "tidy",
										title: t("toolbar.layout"),
										onClick: () => {
											canvasRef.current?.tidy();
										},
										children: t("toolbar.layout")
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: project_space_module_css_default.toolButton,
										"data-action": "zoom-out",
										"aria-label": t("toolbar.zoomOut"),
										title: t("toolbar.zoomOut"),
										onClick: () => {
											canvasRef.current?.zoom(1 / 1.15);
										},
										children: "−"
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: project_space_module_css_default.toolButton,
										"data-action": "zoom-in",
										"aria-label": t("toolbar.zoomIn"),
										title: t("toolbar.zoomIn"),
										onClick: () => {
											canvasRef.current?.zoom(1.15);
										},
										children: "+"
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: cx(project_space_module_css_default.toolButton, detailOpen && project_space_module_css_default.toolButtonActive),
										"data-toggle-detail": "",
										"aria-pressed": detailOpen,
										onClick: () => {
											setDetailOpen((current) => !current);
										},
										children: detailOpen ? t("toolbar.detailHide") : t("toolbar.detail")
									})
								]
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: project_space_module_css_default.shortcutHint,
						children: t("toolbar.help")
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: project_space_module_css_default.workspace,
						children: [(0, react_jsx_runtime.jsx)("div", {
							className: project_space_module_css_default.mainColumn,
							children: model.phase !== "ready" ? (0, react_jsx_runtime.jsx)(StateNotice, {
								phase: model.phase,
								errorMessage: model.errorMessage,
								t
							}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								(0, react_jsx_runtime.jsx)(GraphCanvas, {
									ref: canvasRef,
									model,
									selectedId,
									highlight,
									detailOpen,
									initialView,
									t,
									onSelect: select,
									onPersist: persist
								}),
								model.results.length === 0 && (0, react_jsx_runtime.jsx)("p", {
									className: project_space_module_css_default.recordsNotice,
									role: "status",
									children: t("shell.recordsMissing")
								}),
								(0, react_jsx_runtime.jsx)(AttentionDock, {
									items: model.attention,
									t,
									onLocate: locate
								})
							] })
						}), detailOpen && model.phase === "ready" && (0, react_jsx_runtime.jsx)(DetailPanel, {
							model,
							selectedId,
							sessionId,
							t,
							onClose: () => {
								setDetailOpen(false);
							},
							onSelect: select,
							sameSessionFocusUnavailable: t("panel.referenceSameUnavailable"),
							onOpenSourceSession: openSourceSession
						})]
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** Project-space Web dictionaries. */
		/** Locale namespace owned by the Project Space Web UI. */
		const NS = "projectSpace";
		/** Simplified Chinese dictionary and key source. */
		/** Simplified Chinese dictionary and key source. */
		const zh = {
			"view.workflow": "工作流",
			"view.projectSummary": "项目摘要",
			"shell.loading": "正在加载项目数据…",
			"shell.teamAbsent": "Agent Teams 未启用，或当前 Session 不是 Team Lead",
			"shell.teamAbsentHint": "启用 Agent Teams 后，这里会显示真实的 Goal、成员、任务与协作记录；不会伪造示例数据。",
			"shell.projectionError": "协作数据加载失败：{message}",
			"shell.projectionUnknownError": "未知错误",
			"shell.goalMissing": "未设置目标",
			"shell.goalUnavailable": "Goal 投影不可用",
			"shell.recordsMissing": "暂无协作记录（由 Lead 写入）",
			"shell.recordsUnavailable": "协作记录投影不可用（未启用 collaboration-records）",
			"shell.noPercent": "不提供百分比：没有真实进度数据",
			"goal.phase.active": "推进中",
			"goal.phase.paused": "已暂停",
			"goal.phase.blocked": "已阻塞",
			"goal.phase.complete": "已完成",
			"goal.rounds": "已用 {started}/{max} 轮",
			"goal.revision": "修订 {revision}",
			"count.members": "{count} 名成员",
			"count.tasks": "{count} 项任务",
			"count.records": "{count} 条记录",
			"count.pending": "{count} 项待确认",
			"node.goal": "指示 · 目标",
			"node.lead": "Lead",
			"node.member": "成员",
			"node.task": "任务",
			"node.result": "协作记录",
			"node.aria": "{kind}：{title}",
			"runtime.running": "运行中",
			"runtime.inactive": "未运行",
			"runtime.provisioning": "准备中",
			"runtime.failed": "失败",
			"runtime.unknown": "运行态未知",
			"task.status.pending": "待处理",
			"task.status.in_progress": "进行中",
			"task.status.completed": "已完成",
			"task.ready": "可开始",
			"task.blocked": "被依赖阻塞",
			"task.blockedBy": "依赖：{ids}",
			"task.revision": "修订 {revision}",
			"task.owner": "负责：{name}",
			"task.ownerUnknown": "未分配",
			"task.ownerAmbiguous": "未匹配（重名成员）",
			"task.writeScopes": "写入范围：{scopes}",
			"label.blockedBy": "依赖",
			"label.writeScopes": "写入范围",
			"label.rounds": "轮次",
			"edge.goalLead": "目标 → Lead",
			"edge.delegate": "委派",
			"edge.task": "负责",
			"edge.result": "显式关联",
			"edge.memberResult": "记录关联",
			"edge.aria": "{from} 到 {to}：{label}",
			"attention.title": "待你确认",
			"attention.count": "{count} 项",
			"attention.clear": "暂无待确认事项",
			"attention.hint": "待确认项来自 Lead 最新协作记录的 pending；查看详情不会清除，只有记录被 Lead 修订并处理后才会消失。",
			"attention.record": "记录「{title}」· 修订 {revision}",
			"attention.locate": "定位：{text}",
			"toolbar.fit": "全览（F）",
			"toolbar.layout": "整理布局",
			"toolbar.detail": "详情",
			"toolbar.detailHide": "收起详情",
			"toolbar.zoomIn": "放大",
			"toolbar.zoomOut": "缩小",
			"toolbar.help": "点选查看详情 · F 全览 · Esc 恢复聚焦前视口",
			"canvas.aria": "项目工作流画布",
			"canvas.shortcuts": "按 F 全览，按 Esc 恢复聚焦前视口",
			"canvas.edgeLabel": "{label}",
			"detail.title": "详情",
			"detail.close": "关闭详情",
			"detail.empty": "选择一个节点或关系查看详情",
			"detail.kind": "类型",
			"detail.status": "状态",
			"detail.runtime": "运行态",
			"detail.runtimeHint": "运行态来自 Session 实时状态；未知时不显示空闲。",
			"detail.lifecycle": "生命周期",
			"detail.unknown": "未知",
			"detail.author": "作者",
			"detail.revision": "版本 {revision}",
			"detail.updated": "更新于 {time}",
			"detail.summary": "摘要",
			"detail.content": "正文",
			"detail.recordId": "记录 ID",
			"detail.associations": "显式关联",
			"detail.associationsTasks": "任务",
			"detail.associationsMembers": "成员",
			"detail.associationsMissing": "关联未提供",
			"detail.pending": "待确认事项",
			"detail.pendingNone": "无待确认事项",
			"detail.pendingHint": "查看不会清除；仅当 Lead 的新版本记录移除该项时消失。",
			"detail.versions": "版本历史",
			"detail.versionsCount": "{count} 个版本",
			"detail.versionEntry": "修订 {revision} · seq {seq}",
			"detail.references": "依据引用",
			"detail.referencesNone": "未提供依据引用",
			"detail.referenceMeta": "{sessionId} · seq {seq}",
			"detail.referenceSame": "定位 seq {seq}",
			"detail.referenceCross": "打开来源 Session",
			"detail.referenceCrossNotice": "已打开来源 Session「{sessionId}」；跨 Session 精确 seq 聚焦暂未接通。",
			"detail.referenceFailed": "打开来源 Session 失败：{message}",
			"detail.owner": "负责人",
			"detail.tasksOwned": "负责的任务",
			"detail.resultsAssociated": "关联的协作记录",
			"detail.resultsNone": "暂无关联记录",
			"detail.relations": "{count} 条关系",
			"detail.edgeFrom": "从",
			"detail.edgeTo": "到",
			"detail.edgeKind": "关系",
			"detail.recordsHint": "Lead 整理并持续修订；只展示，不写记录。",
			"detail.goal": "目标",
			"detail.objective": "目标内容",
			"summary.title": "项目摘要",
			"summary.subtitle": "与工作流图使用同一份真实投影数据",
			"summary.goal": "目标",
			"summary.members": "成员",
			"summary.tasks": "任务",
			"summary.records": "协作记录",
			"summary.attention": "待确认",
			"summary.membersNone": "暂无成员",
			"summary.tasksNone": "暂无共享任务",
			"summary.recordsNone": "暂无协作记录（由 Lead 写入）",
			"summary.pending": "{count} 项待确认",
			"summary.pendingNone": "无待确认",
			"summary.author": "作者",
			"summary.updated": "更新于",
			"summary.versions": "{count} 个版本",
			"summary.taskCount": "{count} 项",
			"summary.runtime": "实时运行态",
			"summary.associationsMissing": "关联未提供",
			"summary.blockedBy": "依赖：{ids}",
			"summary.ready": "可开始",
			"summary.live": "成员运行态来自 Session 实时状态",
			"summary.unowned": "未分配",
			"summary.ownerAmbiguous": "未匹配（重名成员）",
			"summary.openInWorkflow": "在工作流中查看",
			"collab.title": "Lead 协作记录",
			"collab.subtitle": "由 Lead 整理并持续修订；这里只读展示，不写记录",
			"collab.empty": "暂无协作记录（由 Lead 写入）",
			"collab.unavailable": "协作记录投影不可用",
			"collab.loading": "正在读取协作记录…",
			"collab.author": "作者",
			"collab.revision": "版本 {revision}",
			"collab.updated": "更新于 {time}",
			"collab.versions": "版本历史",
			"collab.versionCurrent": "当前版本",
			"collab.versionsToggle": "展开版本历史",
			"collab.versionsToggleCollapse": "收起版本历史",
			"collab.pending": "待确认",
			"collab.pendingNone": "无待确认事项",
			"collab.associations": "显式关联",
			"collab.associationsMissing": "关联未提供",
			"collab.references": "依据引用",
			"collab.referencesNone": "未提供依据引用",
			"collab.referenceSame": "定位 seq {seq}",
			"collab.referenceCross": "打开来源 Session",
			"collab.referenceCrossNotice": "已打开来源 Session「{sessionId}」；跨 Session 精确 seq 聚焦暂未接通。",
			"collab.referenceFailed": "打开来源 Session 失败：{message}",
			"collab.readonly": "只展示 Lead 写入的记录；此区域不写记录。",
			"sidebar.title": "协作记录",
			"sidebar.description": "只读查看 Lead 的协作记录",
			"header.trigger": "记录",
			"panel.referenceSameUnavailable": "精确 seq 聚焦需要原生扩展，当前降级版本不可用。",
			"common.unknown": "未知",
			"common.none": "无",
			"time.unknown": "时间未知"
		};
		/** English dictionary checked against the Chinese key set. */
		const en = {
			"view.workflow": "Workflow",
			"view.projectSummary": "Summary",
			"shell.loading": "Loading project data…",
			"shell.teamAbsent": "Agent Teams is not enabled, or this Session is not a Team Lead",
			"shell.teamAbsentHint": "With Agent Teams enabled, this view shows the real Goal, members, tasks, and collaboration records; it never fabricates sample data.",
			"shell.projectionError": "Could not load collaboration data: {message}",
			"shell.projectionUnknownError": "Unknown error",
			"shell.goalMissing": "No goal set",
			"shell.goalUnavailable": "Goal projection is unavailable",
			"shell.recordsMissing": "No collaboration records yet (written by the Lead)",
			"shell.recordsUnavailable": "Collaboration-record projection is unavailable (collaboration-records not enabled)",
			"shell.noPercent": "No percentage is shown: no real progress data",
			"goal.phase.active": "In progress",
			"goal.phase.paused": "Paused",
			"goal.phase.blocked": "Blocked",
			"goal.phase.complete": "Completed",
			"goal.rounds": "{started}/{max} rounds used",
			"goal.revision": "Revision {revision}",
			"count.members": "{count} members",
			"count.tasks": "{count} tasks",
			"count.records": "{count} records",
			"count.pending": "{count} pending",
			"node.goal": "Instruction · goal",
			"node.lead": "Lead",
			"node.member": "Member",
			"node.task": "Task",
			"node.result": "Collaboration record",
			"node.aria": "{kind}: {title}",
			"runtime.running": "Running",
			"runtime.inactive": "Not running",
			"runtime.provisioning": "Provisioning",
			"runtime.failed": "Failed",
			"runtime.unknown": "Runtime unknown",
			"task.status.pending": "Pending",
			"task.status.in_progress": "In progress",
			"task.status.completed": "Completed",
			"task.ready": "Ready",
			"task.blocked": "Blocked by dependencies",
			"task.blockedBy": "Blocked by: {ids}",
			"task.revision": "Revision {revision}",
			"task.owner": "Owner: {name}",
			"task.ownerUnknown": "Unassigned",
			"task.ownerAmbiguous": "Unmatched (duplicate member name)",
			"task.writeScopes": "Write scopes: {scopes}",
			"label.blockedBy": "Blocked by",
			"label.writeScopes": "Write scopes",
			"label.rounds": "Rounds",
			"edge.goalLead": "Goal → Lead",
			"edge.delegate": "Delegates",
			"edge.task": "Owns",
			"edge.result": "Explicit association",
			"edge.memberResult": "Record association",
			"edge.aria": "{from} to {to}: {label}",
			"attention.title": "Needs your confirmation",
			"attention.count": "{count} items",
			"attention.clear": "No pending items",
			"attention.hint": "Pending items come from the pending fields of the Lead's latest collaboration records. Viewing details does not clear them; only a new Lead revision that processes the item removes it.",
			"attention.record": "Record \"{title}\" · revision {revision}",
			"attention.locate": "Locate: {text}",
			"toolbar.fit": "Fit (F)",
			"toolbar.layout": "Tidy layout",
			"toolbar.detail": "Details",
			"toolbar.detailHide": "Hide details",
			"toolbar.zoomIn": "Zoom in",
			"toolbar.zoomOut": "Zoom out",
			"toolbar.help": "Click a node for details · F to fit · Esc restores the pre-focus viewport",
			"canvas.aria": "Project workflow canvas",
			"canvas.shortcuts": "Press F to fit, Esc to restore the pre-focus viewport",
			"canvas.edgeLabel": "{label}",
			"detail.title": "Details",
			"detail.close": "Close details",
			"detail.empty": "Select a node or relation to see its details",
			"detail.kind": "Type",
			"detail.status": "Status",
			"detail.runtime": "Runtime",
			"detail.runtimeHint": "Runtime comes from live Session status; an unknown value is never shown as idle.",
			"detail.lifecycle": "Lifecycle",
			"detail.unknown": "Unknown",
			"detail.author": "Author",
			"detail.revision": "Version {revision}",
			"detail.updated": "Updated {time}",
			"detail.summary": "Summary",
			"detail.content": "Content",
			"detail.recordId": "Record ID",
			"detail.associations": "Explicit associations",
			"detail.associationsTasks": "Tasks",
			"detail.associationsMembers": "Members",
			"detail.associationsMissing": "Associations not provided",
			"detail.pending": "Pending items",
			"detail.pendingNone": "No pending items",
			"detail.pendingHint": "Viewing does not clear them; only a new Lead revision that removes the item clears it.",
			"detail.versions": "Version history",
			"detail.versionsCount": "{count} versions",
			"detail.versionEntry": "Revision {revision} · seq {seq}",
			"detail.references": "Source references",
			"detail.referencesNone": "No source references provided",
			"detail.referenceMeta": "{sessionId} · seq {seq}",
			"detail.referenceSame": "Focus seq {seq}",
			"detail.referenceCross": "Open source Session",
			"detail.referenceCrossNotice": "Opened source Session \"{sessionId}\"; exact cross-Session seq focusing is not connected yet.",
			"detail.referenceFailed": "Could not open source Session: {message}",
			"detail.owner": "Owner",
			"detail.tasksOwned": "Owned tasks",
			"detail.resultsAssociated": "Associated collaboration records",
			"detail.resultsNone": "No associated records",
			"detail.relations": "{count} relations",
			"detail.edgeFrom": "From",
			"detail.edgeTo": "To",
			"detail.edgeKind": "Relation",
			"detail.recordsHint": "The Lead maintains and revises these records; this view only displays them and never writes.",
			"detail.goal": "Goal",
			"detail.objective": "Objective",
			"summary.title": "Project summary",
			"summary.subtitle": "Same real projection data as the workflow graph",
			"summary.goal": "Goal",
			"summary.members": "Members",
			"summary.tasks": "Tasks",
			"summary.records": "Collaboration records",
			"summary.attention": "Pending",
			"summary.membersNone": "No members",
			"summary.tasksNone": "No shared tasks",
			"summary.recordsNone": "No collaboration records yet (written by the Lead)",
			"summary.pending": "{count} pending",
			"summary.pendingNone": "None pending",
			"summary.author": "Author",
			"summary.updated": "Updated",
			"summary.versions": "{count} versions",
			"summary.taskCount": "{count} items",
			"summary.runtime": "Live runtime",
			"summary.associationsMissing": "Associations not provided",
			"summary.blockedBy": "Blocked by: {ids}",
			"summary.ready": "Ready",
			"summary.live": "Member runtime comes from live Session status",
			"summary.unowned": "Unassigned",
			"summary.ownerAmbiguous": "Unmatched (duplicate member name)",
			"summary.openInWorkflow": "View in workflow",
			"collab.title": "Lead collaboration records",
			"collab.subtitle": "Maintained and revised by the Lead; this panel only displays them and never writes.",
			"collab.empty": "No collaboration records yet (written by the Lead)",
			"collab.unavailable": "Collaboration-record projection is unavailable",
			"collab.loading": "Reading collaboration records…",
			"collab.author": "Author",
			"collab.revision": "Version {revision}",
			"collab.updated": "Updated {time}",
			"collab.versions": "Version history",
			"collab.versionCurrent": "Current version",
			"collab.versionsToggle": "Show version history",
			"collab.versionsToggleCollapse": "Hide version history",
			"collab.pending": "Pending",
			"collab.pendingNone": "No pending items",
			"collab.associations": "Explicit associations",
			"collab.associationsMissing": "Associations not provided",
			"collab.references": "Source references",
			"collab.referencesNone": "No source references provided",
			"collab.referenceSame": "Focus seq {seq}",
			"collab.referenceCross": "Open source Session",
			"collab.referenceCrossNotice": "Opened source Session \"{sessionId}\"; exact cross-Session seq focusing is not connected yet.",
			"collab.referenceFailed": "Could not open source Session: {message}",
			"collab.readonly": "This section only displays records written by the Lead; it never writes here.",
			"sidebar.title": "Collaboration records",
			"sidebar.description": "Read the Lead's collaboration records",
			"header.trigger": "Records",
			"panel.referenceSameUnavailable": "Exact seq focusing needs a native extension and is unavailable in this downgraded build.",
			"common.unknown": "Unknown",
			"common.none": "None",
			"time.unknown": "Time unknown"
		};
		/** Japanese dictionary checked against the Chinese key set. */
		/** Japanese dictionary checked against the Chinese key set. */
		const ja = {
			"view.workflow": "ワークフロー",
			"view.projectSummary": "プロジェクト概要",
			"shell.loading": "プロジェクトデータを読み込み中…",
			"shell.teamAbsent": "Agent Teams が有効になっていないか、この Session は Team Lead ではありません",
			"shell.teamAbsentHint": "Agent Teams を有効にすると、実際の Goal・メンバー・タスク・コラボレーション記録が表示されます。サンプルデータは生成しません。",
			"shell.projectionError": "コラボレーションデータを読み込めませんでした：{message}",
			"shell.projectionUnknownError": "不明なエラー",
			"shell.goalMissing": "目標が設定されていません",
			"shell.goalUnavailable": "Goal 投影は利用できません",
			"shell.recordsMissing": "コラボレーション記録はまだありません（Lead が書き込みます）",
			"shell.recordsUnavailable": "コラボレーション記録の投影は利用できません（collaboration-records が有効になっていません）",
			"shell.noPercent": "パーセントは表示しません：実際の進捗データがありません",
			"goal.phase.active": "進行中",
			"goal.phase.paused": "一時停止中",
			"goal.phase.blocked": "ブロック中",
			"goal.phase.complete": "完了",
			"goal.rounds": "{started}/{max} ラウンド使用済み",
			"goal.revision": "リビジョン {revision}",
			"count.members": "{count} 名のメンバー",
			"count.tasks": "{count} 件のタスク",
			"count.records": "{count} 件の記録",
			"count.pending": "{count} 件の保留中",
			"node.goal": "指示 · 目標",
			"node.lead": "Lead",
			"node.member": "メンバー",
			"node.task": "タスク",
			"node.result": "コラボレーション記録",
			"node.aria": "{kind}：{title}",
			"runtime.running": "実行中",
			"runtime.inactive": "停止中",
			"runtime.provisioning": "準備中",
			"runtime.failed": "失敗",
			"runtime.unknown": "実行状態不明",
			"task.status.pending": "保留中",
			"task.status.in_progress": "進行中",
			"task.status.completed": "完了",
			"task.ready": "準備完了",
			"task.blocked": "依存関係によりブロック",
			"task.blockedBy": "ブロック元：{ids}",
			"task.revision": "リビジョン {revision}",
			"task.owner": "担当：{name}",
			"task.ownerUnknown": "未割り当て",
			"task.ownerAmbiguous": "未一致（メンバー名の重複）",
			"task.writeScopes": "書き込みスコープ：{scopes}",
			"label.blockedBy": "ブロック元",
			"label.writeScopes": "書き込みスコープ",
			"label.rounds": "ラウンド",
			"edge.goalLead": "目標 → Lead",
			"edge.delegate": "委譲",
			"edge.task": "担当",
			"edge.result": "明示的な関連",
			"edge.memberResult": "記録の関連",
			"edge.aria": "{from} から {to}：{label}",
			"attention.title": "確認待ち",
			"attention.count": "{count} 件",
			"attention.clear": "保留中の項目はありません",
			"attention.hint": "保留中の項目は、Lead の最新コラボレーション記録の pending に由来します。詳細を表示しても消えず、記録を Lead が改訂して処理した場合にのみ消えます。",
			"attention.record": "記録「{title}」· リビジョン {revision}",
			"attention.locate": "移動：{text}",
			"toolbar.fit": "全体表示（F）",
			"toolbar.layout": "レイアウトを整理",
			"toolbar.detail": "詳細",
			"toolbar.detailHide": "詳細を閉じる",
			"toolbar.zoomIn": "拡大",
			"toolbar.zoomOut": "縮小",
			"toolbar.help": "ノードをクリックで詳細 · F で全体表示 · Esc でフォーカス前の表示位置に戻る",
			"canvas.aria": "プロジェクトワークフローキャンバス",
			"canvas.shortcuts": "F で全体表示、Esc でフォーカス前の表示位置に戻ります",
			"canvas.edgeLabel": "{label}",
			"detail.title": "詳細",
			"detail.close": "詳細を閉じる",
			"detail.empty": "ノードまたは関係を選択して詳細を表示",
			"detail.kind": "種類",
			"detail.status": "状態",
			"detail.runtime": "実行状態",
			"detail.runtimeHint": "実行状態は Session のリアルタイム状態に由来します。不明な値をアイドルとして表示しません。",
			"detail.lifecycle": "ライフサイクル",
			"detail.unknown": "不明",
			"detail.author": "作成者",
			"detail.revision": "バージョン {revision}",
			"detail.updated": "更新：{time}",
			"detail.summary": "要約",
			"detail.content": "本文",
			"detail.recordId": "記録 ID",
			"detail.associations": "明示的な関連",
			"detail.associationsTasks": "タスク",
			"detail.associationsMembers": "メンバー",
			"detail.associationsMissing": "関連が提供されていません",
			"detail.pending": "保留中の項目",
			"detail.pendingNone": "保留中の項目はありません",
			"detail.pendingHint": "表示しても消えません。項目を削除した新しい Lead のリビジョンでのみ消えます。",
			"detail.versions": "バージョン履歴",
			"detail.versionsCount": "{count} バージョン",
			"detail.versionEntry": "リビジョン {revision} · seq {seq}",
			"detail.references": "根拠参照",
			"detail.referencesNone": "根拠参照は提供されていません",
			"detail.referenceMeta": "{sessionId} · seq {seq}",
			"detail.referenceSame": "seq {seq} に移動",
			"detail.referenceCross": "ソース Session を開く",
			"detail.referenceCrossNotice": "ソース Session「{sessionId}」を開きました。Session を跨ぐ正確な seq フォーカスはまだ接続されていません。",
			"detail.referenceFailed": "ソース Session を開けませんでした：{message}",
			"detail.owner": "担当者",
			"detail.tasksOwned": "担当タスク",
			"detail.resultsAssociated": "関連するコラボレーション記録",
			"detail.resultsNone": "関連する記録はありません",
			"detail.relations": "{count} 件の関係",
			"detail.edgeFrom": "から",
			"detail.edgeTo": "へ",
			"detail.edgeKind": "関係",
			"detail.recordsHint": "Lead が整理・改訂する記録です。このビューは表示のみで書き込みません。",
			"detail.goal": "目標",
			"detail.objective": "目標内容",
			"summary.title": "プロジェクト概要",
			"summary.subtitle": "ワークフロー図と同じ実際の投影データ",
			"summary.goal": "目標",
			"summary.members": "メンバー",
			"summary.tasks": "タスク",
			"summary.records": "コラボレーション記録",
			"summary.attention": "保留中",
			"summary.membersNone": "メンバーがいません",
			"summary.tasksNone": "共有タスクがありません",
			"summary.recordsNone": "コラボレーション記録はまだありません（Lead が書き込みます）",
			"summary.pending": "{count} 件の保留中",
			"summary.pendingNone": "保留中なし",
			"summary.author": "作成者",
			"summary.updated": "更新",
			"summary.versions": "{count} バージョン",
			"summary.taskCount": "{count} 件",
			"summary.runtime": "リアルタイム実行状態",
			"summary.associationsMissing": "関連が提供されていません",
			"summary.blockedBy": "ブロック元：{ids}",
			"summary.ready": "準備完了",
			"summary.live": "メンバーの実行状態は Session のリアルタイム状態に由来します",
			"summary.unowned": "未割り当て",
			"summary.ownerAmbiguous": "未一致（メンバー名の重複）",
			"summary.openInWorkflow": "ワークフローで表示",
			"collab.title": "Lead コラボレーション記録",
			"collab.subtitle": "Lead が整理・改訂します。ここでは読み取り専用で表示し、書き込みません。",
			"collab.empty": "コラボレーション記録はまだありません（Lead が書き込みます）",
			"collab.unavailable": "コラボレーション記録の投影は利用できません",
			"collab.loading": "コラボレーション記録を読み込み中…",
			"collab.author": "作成者",
			"collab.revision": "バージョン {revision}",
			"collab.updated": "更新：{time}",
			"collab.versions": "バージョン履歴",
			"collab.versionCurrent": "現在のバージョン",
			"collab.versionsToggle": "バージョン履歴を表示",
			"collab.versionsToggleCollapse": "バージョン履歴を隠す",
			"collab.pending": "保留中",
			"collab.pendingNone": "保留中の項目はありません",
			"collab.associations": "明示的な関連",
			"collab.associationsMissing": "関連が提供されていません",
			"collab.references": "根拠参照",
			"collab.referencesNone": "根拠参照は提供されていません",
			"collab.referenceSame": "seq {seq} に移動",
			"collab.referenceCross": "ソース Session を開く",
			"collab.referenceCrossNotice": "ソース Session「{sessionId}」を開きました。Session を跨ぐ正確な seq フォーカスはまだ接続されていません。",
			"collab.referenceFailed": "ソース Session を開けませんでした：{message}",
			"collab.readonly": "このセクションは Lead が書き込んだ記録を表示するだけで、書き込みは行いません。",
			"sidebar.title": "コラボレーション記録",
			"sidebar.description": "Lead のコラボレーション記録を読み取り専用で表示",
			"header.trigger": "記録",
			"panel.referenceSameUnavailable": "正確な seq フォーカスにはネイティブ拡張が必要で、このダウングレード版では利用できません。",
			"common.unknown": "不明",
			"common.none": "なし",
			"time.unknown": "時間不明"
		};
		/** Spanish dictionary checked against the Chinese key set. */
		/** Spanish dictionary checked against the Chinese key set. */
		const es = {
			"view.workflow": "Flujo de trabajo",
			"view.projectSummary": "Resumen del proyecto",
			"shell.loading": "Cargando datos del proyecto…",
			"shell.teamAbsent": "Agent Teams no está habilitado, o esta Session no es un Team Lead",
			"shell.teamAbsentHint": "Con Agent Teams habilitado, esta vista muestra el Goal, los miembros, las tareas y los registros de colaboración reales; nunca inventa datos de ejemplo.",
			"shell.projectionError": "No se pudieron cargar los datos de colaboración: {message}",
			"shell.projectionUnknownError": "Error desconocido",
			"shell.goalMissing": "Sin objetivo establecido",
			"shell.goalUnavailable": "La proyección de Goal no está disponible",
			"shell.recordsMissing": "Aún no hay registros de colaboración (los escribe el Lead)",
			"shell.recordsUnavailable": "La proyección de registros de colaboración no está disponible (collaboration-records no habilitado)",
			"shell.noPercent": "No se muestra porcentaje: no hay datos de progreso reales",
			"goal.phase.active": "En curso",
			"goal.phase.paused": "En pausa",
			"goal.phase.blocked": "Bloqueado",
			"goal.phase.complete": "Completado",
			"goal.rounds": "{started}/{max} rondas usadas",
			"goal.revision": "Revisión {revision}",
			"count.members": "{count} miembros",
			"count.tasks": "{count} tareas",
			"count.records": "{count} registros",
			"count.pending": "{count} pendientes",
			"node.goal": "Indicación · objetivo",
			"node.lead": "Lead",
			"node.member": "Miembro",
			"node.task": "Tarea",
			"node.result": "Registro de colaboración",
			"node.aria": "{kind}: {title}",
			"runtime.running": "En ejecución",
			"runtime.inactive": "Sin ejecutar",
			"runtime.provisioning": "Preparando",
			"runtime.failed": "Fallido",
			"runtime.unknown": "Estado de ejecución desconocido",
			"task.status.pending": "Pendiente",
			"task.status.in_progress": "En curso",
			"task.status.completed": "Completado",
			"task.ready": "Listo",
			"task.blocked": "Bloqueado por dependencias",
			"task.blockedBy": "Bloqueado por: {ids}",
			"task.revision": "Revisión {revision}",
			"task.owner": "Responsable: {name}",
			"task.ownerUnknown": "Sin asignar",
			"task.ownerAmbiguous": "Sin coincidencia (nombre de miembro duplicado)",
			"task.writeScopes": "Ámbitos de escritura: {scopes}",
			"label.blockedBy": "Bloqueado por",
			"label.writeScopes": "Ámbitos de escritura",
			"label.rounds": "Rondas",
			"edge.goalLead": "Objetivo → Lead",
			"edge.delegate": "Delegaciones",
			"edge.task": "Posee",
			"edge.result": "Asociación explícita",
			"edge.memberResult": "Asociación de registro",
			"edge.aria": "{from} a {to}: {label}",
			"attention.title": "Necesita tu confirmación",
			"attention.count": "{count} elementos",
			"attention.clear": "Sin elementos pendientes",
			"attention.hint": "Los elementos pendientes provienen del campo pending de los últimos registros de colaboración del Lead. Ver los detalles no los borra; solo una nueva revisión del Lead que procese el elemento los elimina.",
			"attention.record": "Registro \"{title}\" · revisión {revision}",
			"attention.locate": "Ubicar: {text}",
			"toolbar.fit": "Ajustar (F)",
			"toolbar.layout": "Ordenar diseño",
			"toolbar.detail": "Detalles",
			"toolbar.detailHide": "Ocultar detalles",
			"toolbar.zoomIn": "Acercar",
			"toolbar.zoomOut": "Alejar",
			"toolbar.help": "Haz clic en un nodo para ver detalles · F para ajustar · Esc restaura la vista previa al enfoque",
			"canvas.aria": "Lienzo del flujo de trabajo del proyecto",
			"canvas.shortcuts": "Pulsa F para ajustar, Esc para restaurar la vista previa al enfoque",
			"canvas.edgeLabel": "{label}",
			"detail.title": "Detalles",
			"detail.close": "Cerrar detalles",
			"detail.empty": "Selecciona un nodo o relación para ver sus detalles",
			"detail.kind": "Tipo",
			"detail.status": "Estado",
			"detail.runtime": "Estado de ejecución",
			"detail.runtimeHint": "El estado de ejecución proviene del estado de Session en vivo; un valor desconocido nunca se muestra como inactivo.",
			"detail.lifecycle": "Ciclo de vida",
			"detail.unknown": "Desconocido",
			"detail.author": "Autor",
			"detail.revision": "Versión {revision}",
			"detail.updated": "Actualizado {time}",
			"detail.summary": "Resumen",
			"detail.content": "Contenido",
			"detail.recordId": "ID del registro",
			"detail.associations": "Asociaciones explícitas",
			"detail.associationsTasks": "Tareas",
			"detail.associationsMembers": "Miembros",
			"detail.associationsMissing": "Asociaciones no proporcionadas",
			"detail.pending": "Elementos pendientes",
			"detail.pendingNone": "Sin elementos pendientes",
			"detail.pendingHint": "Verlos no los borra; solo una nueva revisión del Lead que elimine el elemento los borra.",
			"detail.versions": "Historial de versiones",
			"detail.versionsCount": "{count} versiones",
			"detail.versionEntry": "Revisión {revision} · seq {seq}",
			"detail.references": "Referencias de origen",
			"detail.referencesNone": "Sin referencias de origen",
			"detail.referenceMeta": "{sessionId} · seq {seq}",
			"detail.referenceSame": "Enfocar seq {seq}",
			"detail.referenceCross": "Abrir Session de origen",
			"detail.referenceCrossNotice": "Se abrió la Session de origen \"{sessionId}\"; el enfoque exacto por seq entre Session aún no está conectado.",
			"detail.referenceFailed": "No se pudo abrir la Session de origen: {message}",
			"detail.owner": "Propietario",
			"detail.tasksOwned": "Tareas propias",
			"detail.resultsAssociated": "Registros de colaboración asociados",
			"detail.resultsNone": "Sin registros asociados",
			"detail.relations": "{count} relaciones",
			"detail.edgeFrom": "De",
			"detail.edgeTo": "A",
			"detail.edgeKind": "Relación",
			"detail.recordsHint": "El Lead mantiene y revisa estos registros; esta vista solo los muestra y nunca escribe.",
			"detail.goal": "Objetivo",
			"detail.objective": "Objetivo",
			"summary.title": "Resumen del proyecto",
			"summary.subtitle": "Los mismos datos reales de proyección que el grafo de flujo de trabajo",
			"summary.goal": "Objetivo",
			"summary.members": "Miembros",
			"summary.tasks": "Tareas",
			"summary.records": "Registros de colaboración",
			"summary.attention": "Pendiente",
			"summary.membersNone": "Sin miembros",
			"summary.tasksNone": "Sin tareas compartidas",
			"summary.recordsNone": "Aún no hay registros de colaboración (los escribe el Lead)",
			"summary.pending": "{count} pendientes",
			"summary.pendingNone": "Ninguno pendiente",
			"summary.author": "Autor",
			"summary.updated": "Actualizado",
			"summary.versions": "{count} versiones",
			"summary.taskCount": "{count} elementos",
			"summary.runtime": "Estado de ejecución en vivo",
			"summary.associationsMissing": "Asociaciones no proporcionadas",
			"summary.blockedBy": "Bloqueado por: {ids}",
			"summary.ready": "Listo",
			"summary.live": "El estado de ejecución de los miembros proviene del estado de Session en vivo",
			"summary.unowned": "Sin asignar",
			"summary.ownerAmbiguous": "Sin coincidencia (nombre de miembro duplicado)",
			"summary.openInWorkflow": "Ver en el flujo de trabajo",
			"collab.title": "Registros de colaboración del Lead",
			"collab.subtitle": "Mantenidos y revisados por el Lead; este panel solo los muestra y nunca escribe.",
			"collab.empty": "Aún no hay registros de colaboración (los escribe el Lead)",
			"collab.unavailable": "La proyección de registros de colaboración no está disponible",
			"collab.loading": "Leyendo registros de colaboración…",
			"collab.author": "Autor",
			"collab.revision": "Versión {revision}",
			"collab.updated": "Actualizado {time}",
			"collab.versions": "Historial de versiones",
			"collab.versionCurrent": "Versión actual",
			"collab.versionsToggle": "Mostrar historial de versiones",
			"collab.versionsToggleCollapse": "Ocultar historial de versiones",
			"collab.pending": "Pendiente",
			"collab.pendingNone": "Sin elementos pendientes",
			"collab.associations": "Asociaciones explícitas",
			"collab.associationsMissing": "Asociaciones no proporcionadas",
			"collab.references": "Referencias de origen",
			"collab.referencesNone": "Sin referencias de origen",
			"collab.referenceSame": "Enfocar seq {seq}",
			"collab.referenceCross": "Abrir Session de origen",
			"collab.referenceCrossNotice": "Se abrió la Session de origen \"{sessionId}\"; el enfoque exacto por seq entre Session aún no está conectado.",
			"collab.referenceFailed": "No se pudo abrir la Session de origen: {message}",
			"collab.readonly": "Esta sección solo muestra registros escritos por el Lead; nunca escribe aquí.",
			"sidebar.title": "Registros de colaboración",
			"sidebar.description": "Consultar los registros de colaboración del Lead en solo lectura",
			"header.trigger": "Registros",
			"panel.referenceSameUnavailable": "El enfoque exacto por seq necesita una extensión nativa y no está disponible en esta versión degradada.",
			"common.unknown": "Desconocido",
			"common.none": "Ninguno",
			"time.unknown": "Hora desconocida"
		};
		/** French dictionary checked against the Chinese key set. */
		/** French dictionary checked against the Chinese key set. */
		const fr = {
			"view.workflow": "Flux de travail",
			"view.projectSummary": "Synthèse du projet",
			"shell.loading": "Chargement des données du projet…",
			"shell.teamAbsent": "Agent Teams n'est pas activé, ou cette Session n'est pas un Team Lead",
			"shell.teamAbsentHint": "Avec Agent Teams activé, cette vue affiche le Goal, les membres, les tâches et les enregistrements de collaboration réels ; elle ne fabrique jamais de données d'exemple.",
			"shell.projectionError": "Impossible de charger les données de collaboration : {message}",
			"shell.projectionUnknownError": "Erreur inconnue",
			"shell.goalMissing": "Aucun objectif défini",
			"shell.goalUnavailable": "La projection Goal est indisponible",
			"shell.recordsMissing": "Aucun enregistrement de collaboration pour l'instant (écrits par le Lead)",
			"shell.recordsUnavailable": "La projection des enregistrements de collaboration est indisponible (collaboration-records non activé)",
			"shell.noPercent": "Aucun pourcentage affiché : aucune donnée de progression réelle",
			"goal.phase.active": "En cours",
			"goal.phase.paused": "En pause",
			"goal.phase.blocked": "Bloqué",
			"goal.phase.complete": "Terminé",
			"goal.rounds": "{started}/{max} tours utilisés",
			"goal.revision": "Révision {revision}",
			"count.members": "{count} membres",
			"count.tasks": "{count} tâches",
			"count.records": "{count} enregistrements",
			"count.pending": "{count} en attente",
			"node.goal": "Instruction · objectif",
			"node.lead": "Lead",
			"node.member": "Membre",
			"node.task": "Tâche",
			"node.result": "Enregistrement de collaboration",
			"node.aria": "{kind} : {title}",
			"runtime.running": "En cours d'exécution",
			"runtime.inactive": "À l'arrêt",
			"runtime.provisioning": "En préparation",
			"runtime.failed": "Échec",
			"runtime.unknown": "État d'exécution inconnu",
			"task.status.pending": "En attente",
			"task.status.in_progress": "En cours",
			"task.status.completed": "Terminé",
			"task.ready": "Prêt",
			"task.blocked": "Bloqué par des dépendances",
			"task.blockedBy": "Bloqué par : {ids}",
			"task.revision": "Révision {revision}",
			"task.owner": "Responsable : {name}",
			"task.ownerUnknown": "Non attribué",
			"task.ownerAmbiguous": "Non apparié (nom de membre en double)",
			"task.writeScopes": "Portées d'écriture : {scopes}",
			"label.blockedBy": "Bloqué par",
			"label.writeScopes": "Portées d’écriture",
			"label.rounds": "Tours",
			"edge.goalLead": "Objectif → Lead",
			"edge.delegate": "Délégations",
			"edge.task": "Détient",
			"edge.result": "Association explicite",
			"edge.memberResult": "Association d'enregistrement",
			"edge.aria": "{from} vers {to} : {label}",
			"attention.title": "Nécessite votre confirmation",
			"attention.count": "{count} éléments",
			"attention.clear": "Aucun élément en attente",
			"attention.hint": "Les éléments en attente proviennent du champ pending des derniers enregistrements de collaboration du Lead. Consulter les détails ne les efface pas ; seule une nouvelle révision du Lead traitant l'élément les supprime.",
			"attention.record": "Enregistrement « {title} » · révision {revision}",
			"attention.locate": "Localiser : {text}",
			"toolbar.fit": "Ajuster (F)",
			"toolbar.layout": "Ranger la disposition",
			"toolbar.detail": "Détails",
			"toolbar.detailHide": "Masquer les détails",
			"toolbar.zoomIn": "Zoom avant",
			"toolbar.zoomOut": "Zoom arrière",
			"toolbar.help": "Cliquez sur un nœud pour les détails · F pour ajuster · Échap restaure la vue d'avant la mise au point",
			"canvas.aria": "Canevas du flux de travail du projet",
			"canvas.shortcuts": "Appuyez sur F pour ajuster, Échap pour restaurer la vue d'avant la mise au point",
			"canvas.edgeLabel": "{label}",
			"detail.title": "Détails",
			"detail.close": "Fermer les détails",
			"detail.empty": "Sélectionnez un nœud ou une relation pour voir ses détails",
			"detail.kind": "Type",
			"detail.status": "Statut",
			"detail.runtime": "État d'exécution",
			"detail.runtimeHint": "L'état d'exécution provient du statut Session en direct ; une valeur inconnue n'est jamais affichée comme inactive.",
			"detail.lifecycle": "Cycle de vie",
			"detail.unknown": "Inconnu",
			"detail.author": "Auteur",
			"detail.revision": "Version {revision}",
			"detail.updated": "Mis à jour {time}",
			"detail.summary": "Synthèse",
			"detail.content": "Contenu",
			"detail.recordId": "ID d'enregistrement",
			"detail.associations": "Associations explicites",
			"detail.associationsTasks": "Tâches",
			"detail.associationsMembers": "Membres",
			"detail.associationsMissing": "Associations non fournies",
			"detail.pending": "Éléments en attente",
			"detail.pendingNone": "Aucun élément en attente",
			"detail.pendingHint": "Les consulter ne les efface pas ; seule une nouvelle révision du Lead supprimant l'élément les efface.",
			"detail.versions": "Historique des versions",
			"detail.versionsCount": "{count} versions",
			"detail.versionEntry": "Révision {revision} · seq {seq}",
			"detail.references": "Références sources",
			"detail.referencesNone": "Aucune référence source fournie",
			"detail.referenceMeta": "{sessionId} · seq {seq}",
			"detail.referenceSame": "Cibler seq {seq}",
			"detail.referenceCross": "Ouvrir la Session source",
			"detail.referenceCrossNotice": "Session source « {sessionId} » ouverte ; le ciblage exact par seq entre Sessions n'est pas encore connecté.",
			"detail.referenceFailed": "Impossible d'ouvrir la Session source : {message}",
			"detail.owner": "Responsable",
			"detail.tasksOwned": "Tâches détenues",
			"detail.resultsAssociated": "Enregistrements de collaboration associés",
			"detail.resultsNone": "Aucun enregistrement associé",
			"detail.relations": "{count} relations",
			"detail.edgeFrom": "De",
			"detail.edgeTo": "Vers",
			"detail.edgeKind": "Relation",
			"detail.recordsHint": "Le Lead entretient et révise ces enregistrements ; cette vue ne fait que les afficher et n'écrit jamais.",
			"detail.goal": "Objectif",
			"detail.objective": "Objectif",
			"summary.title": "Synthèse du projet",
			"summary.subtitle": "Mêmes données de projection réelles que le graphe de flux de travail",
			"summary.goal": "Objectif",
			"summary.members": "Membres",
			"summary.tasks": "Tâches",
			"summary.records": "Enregistrements de collaboration",
			"summary.attention": "En attente",
			"summary.membersNone": "Aucun membre",
			"summary.tasksNone": "Aucune tâche partagée",
			"summary.recordsNone": "Aucun enregistrement de collaboration pour l'instant (écrits par le Lead)",
			"summary.pending": "{count} en attente",
			"summary.pendingNone": "Aucun en attente",
			"summary.author": "Auteur",
			"summary.updated": "Mis à jour",
			"summary.versions": "{count} versions",
			"summary.taskCount": "{count} éléments",
			"summary.runtime": "État d'exécution en direct",
			"summary.associationsMissing": "Associations non fournies",
			"summary.blockedBy": "Bloqué par : {ids}",
			"summary.ready": "Prêt",
			"summary.live": "L'état d'exécution des membres provient du statut Session en direct",
			"summary.unowned": "Non attribué",
			"summary.ownerAmbiguous": "Non apparié (nom de membre en double)",
			"summary.openInWorkflow": "Voir dans le flux de travail",
			"collab.title": "Enregistrements de collaboration du Lead",
			"collab.subtitle": "Entretenus et révisés par le Lead ; ce panneau ne fait que les afficher.",
			"collab.empty": "Aucun enregistrement de collaboration pour l'instant (écrits par le Lead)",
			"collab.unavailable": "La projection des enregistrements de collaboration est indisponible",
			"collab.loading": "Lecture des enregistrements de collaboration…",
			"collab.author": "Auteur",
			"collab.revision": "Version {revision}",
			"collab.updated": "Mis à jour {time}",
			"collab.versions": "Historique des versions",
			"collab.versionCurrent": "Version actuelle",
			"collab.versionsToggle": "Afficher l'historique des versions",
			"collab.versionsToggleCollapse": "Masquer l'historique des versions",
			"collab.pending": "En attente",
			"collab.pendingNone": "Aucun élément en attente",
			"collab.associations": "Associations explicites",
			"collab.associationsMissing": "Associations non fournies",
			"collab.references": "Références sources",
			"collab.referencesNone": "Aucune référence source fournie",
			"collab.referenceSame": "Cibler seq {seq}",
			"collab.referenceCross": "Ouvrir la Session source",
			"collab.referenceCrossNotice": "Session source « {sessionId} » ouverte ; le ciblage exact par seq entre Sessions n'est pas encore connecté.",
			"collab.referenceFailed": "Impossible d'ouvrir la Session source : {message}",
			"collab.readonly": "Cette section affiche uniquement les enregistrements écrits par le Lead ; elle n'écrit jamais ici.",
			"sidebar.title": "Enregistrements de collaboration",
			"sidebar.description": "Consulter en lecture seule les enregistrements de collaboration du Lead",
			"header.trigger": "Enregistrements",
			"panel.referenceSameUnavailable": "Le ciblage exact par seq nécessite une extension native et n'est pas disponible dans cette version dégradée.",
			"common.unknown": "Inconnu",
			"common.none": "Aucun",
			"time.unknown": "Heure inconnue"
		};
		/** German dictionary checked against the Chinese key set. */
		/** German dictionary checked against the Chinese key set. */
		const de = {
			"view.workflow": "Arbeitsablauf",
			"view.projectSummary": "Projektzusammenfassung",
			"shell.loading": "Projektdaten werden geladen…",
			"shell.teamAbsent": "Agent Teams ist nicht aktiviert, oder diese Session ist kein Team Lead",
			"shell.teamAbsentHint": "Mit aktivierten Agent Teams zeigt diese Ansicht das echte Goal, die Mitglieder, Aufgaben und Kollaborationsdatensätze; sie erzeugt niemals Beispieldaten.",
			"shell.projectionError": "Kollaborationsdaten konnten nicht geladen werden: {message}",
			"shell.projectionUnknownError": "Unbekannter Fehler",
			"shell.goalMissing": "Kein Ziel gesetzt",
			"shell.goalUnavailable": "Goal-Projektion ist nicht verfügbar",
			"shell.recordsMissing": "Noch keine Kollaborationsdatensätze (vom Lead geschrieben)",
			"shell.recordsUnavailable": "Die Projektion der Kollaborationsdatensätze ist nicht verfügbar (collaboration-records nicht aktiviert)",
			"shell.noPercent": "Kein Prozentsatz angezeigt: keine echten Fortschrittsdaten",
			"goal.phase.active": "In Bearbeitung",
			"goal.phase.paused": "Pausiert",
			"goal.phase.blocked": "Blockiert",
			"goal.phase.complete": "Abgeschlossen",
			"goal.rounds": "{started}/{max} Runden verbraucht",
			"goal.revision": "Revision {revision}",
			"count.members": "{count} Mitglieder",
			"count.tasks": "{count} Aufgaben",
			"count.records": "{count} Datensätze",
			"count.pending": "{count} ausstehend",
			"node.goal": "Anweisung · Ziel",
			"node.lead": "Lead",
			"node.member": "Mitglied",
			"node.task": "Aufgabe",
			"node.result": "Kollaborationsdatensatz",
			"node.aria": "{kind}: {title}",
			"runtime.running": "Läuft",
			"runtime.inactive": "Nicht aktiv",
			"runtime.provisioning": "Wird vorbereitet",
			"runtime.failed": "Fehlgeschlagen",
			"runtime.unknown": "Laufzeitstatus unbekannt",
			"task.status.pending": "Ausstehend",
			"task.status.in_progress": "In Bearbeitung",
			"task.status.completed": "Abgeschlossen",
			"task.ready": "Bereit",
			"task.blocked": "Durch Abhängigkeiten blockiert",
			"task.blockedBy": "Blockiert von: {ids}",
			"task.revision": "Revision {revision}",
			"task.owner": "Verantwortlich: {name}",
			"task.ownerUnknown": "Nicht zugewiesen",
			"task.ownerAmbiguous": "Nicht zugeordnet (doppelter Mitgliedsname)",
			"task.writeScopes": "Schreibbereiche: {scopes}",
			"label.blockedBy": "Blockiert von",
			"label.writeScopes": "Schreibbereiche",
			"label.rounds": "Runden",
			"edge.goalLead": "Ziel → Lead",
			"edge.delegate": "Delegationen",
			"edge.task": "Besitzt",
			"edge.result": "Explizite Zuordnung",
			"edge.memberResult": "Datensatzzuordnung",
			"edge.aria": "{from} nach {to}: {label}",
			"attention.title": "Erfordert deine Bestätigung",
			"attention.count": "{count} Einträge",
			"attention.clear": "Keine ausstehenden Einträge",
			"attention.hint": "Ausstehende Einträge stammen aus dem Feld pending der neuesten Kollaborationsdatensätze des Leads. Das Anzeigen von Details löscht sie nicht; nur eine neue Lead-Revision, die den Eintrag verarbeitet, entfernt ihn.",
			"attention.record": "Datensatz \"{title}\" · Revision {revision}",
			"attention.locate": "Anzeigen: {text}",
			"toolbar.fit": "Einpassen (F)",
			"toolbar.layout": "Layout aufräumen",
			"toolbar.detail": "Details",
			"toolbar.detailHide": "Details ausblenden",
			"toolbar.zoomIn": "Vergrößern",
			"toolbar.zoomOut": "Verkleinern",
			"toolbar.help": "Klicke auf einen Knoten für Details · F zum Einpassen · Esc stellt den Ansichtsausschnitt vor dem Fokus wieder her",
			"canvas.aria": "Arbeitsablauf-Canvas des Projekts",
			"canvas.shortcuts": "F zum Einpassen, Esc zum Wiederherstellen des Ausschnitts vor dem Fokus",
			"canvas.edgeLabel": "{label}",
			"detail.title": "Details",
			"detail.close": "Details schließen",
			"detail.empty": "Wähle einen Knoten oder eine Beziehung für Details",
			"detail.kind": "Typ",
			"detail.status": "Status",
			"detail.runtime": "Laufzeitstatus",
			"detail.runtimeHint": "Der Laufzeitstatus stammt aus dem Live-Session-Status; ein unbekannter Wert wird nie als inaktiv angezeigt.",
			"detail.lifecycle": "Lebenszyklus",
			"detail.unknown": "Unbekannt",
			"detail.author": "Autor",
			"detail.revision": "Version {revision}",
			"detail.updated": "Aktualisiert {time}",
			"detail.summary": "Zusammenfassung",
			"detail.content": "Inhalt",
			"detail.recordId": "Datensatz-ID",
			"detail.associations": "Explizite Zuordnungen",
			"detail.associationsTasks": "Aufgaben",
			"detail.associationsMembers": "Mitglieder",
			"detail.associationsMissing": "Zuordnungen nicht angegeben",
			"detail.pending": "Ausstehende Einträge",
			"detail.pendingNone": "Keine ausstehenden Einträge",
			"detail.pendingHint": "Das Anzeigen löscht sie nicht; nur eine neue Lead-Revision, die den Eintrag entfernt, löscht ihn.",
			"detail.versions": "Versionshistorie",
			"detail.versionsCount": "{count} Versionen",
			"detail.versionEntry": "Revision {revision} · seq {seq}",
			"detail.references": "Quellverweise",
			"detail.referencesNone": "Keine Quellverweise angegeben",
			"detail.referenceMeta": "{sessionId} · seq {seq}",
			"detail.referenceSame": "Seq {seq} fokussieren",
			"detail.referenceCross": "Quell-Session öffnen",
			"detail.referenceCrossNotice": "Quell-Session \"{sessionId}\" geöffnet; exakte Seq-Fokussierung über Sessions hinweg ist noch nicht angebunden.",
			"detail.referenceFailed": "Quell-Session konnte nicht geöffnet werden: {message}",
			"detail.owner": "Verantwortlicher",
			"detail.tasksOwned": "Eigene Aufgaben",
			"detail.resultsAssociated": "Zugeordnete Kollaborationsdatensätze",
			"detail.resultsNone": "Keine zugeordneten Datensätze",
			"detail.relations": "{count} Beziehungen",
			"detail.edgeFrom": "Von",
			"detail.edgeTo": "Nach",
			"detail.edgeKind": "Beziehung",
			"detail.recordsHint": "Der Lead pflegt und überarbeitet diese Datensätze; diese Ansicht zeigt sie nur an und schreibt nie.",
			"detail.goal": "Ziel",
			"detail.objective": "Zielinhalt",
			"summary.title": "Projektzusammenfassung",
			"summary.subtitle": "Dieselben echten Projektionsdaten wie der Arbeitsablauf-Graph",
			"summary.goal": "Ziel",
			"summary.members": "Mitglieder",
			"summary.tasks": "Aufgaben",
			"summary.records": "Kollaborationsdatensätze",
			"summary.attention": "Ausstehend",
			"summary.membersNone": "Keine Mitglieder",
			"summary.tasksNone": "Keine gemeinsamen Aufgaben",
			"summary.recordsNone": "Noch keine Kollaborationsdatensätze (vom Lead geschrieben)",
			"summary.pending": "{count} ausstehend",
			"summary.pendingNone": "Nichts ausstehend",
			"summary.author": "Autor",
			"summary.updated": "Aktualisiert",
			"summary.versions": "{count} Versionen",
			"summary.taskCount": "{count} Einträge",
			"summary.runtime": "Live-Laufzeitstatus",
			"summary.associationsMissing": "Zuordnungen nicht angegeben",
			"summary.blockedBy": "Blockiert von: {ids}",
			"summary.ready": "Bereit",
			"summary.live": "Der Laufzeitstatus der Mitglieder stammt aus dem Live-Session-Status",
			"summary.unowned": "Nicht zugewiesen",
			"summary.ownerAmbiguous": "Nicht zugeordnet (doppelter Mitgliedsname)",
			"summary.openInWorkflow": "Im Arbeitsablauf anzeigen",
			"collab.title": "Kollaborationsdatensätze des Leads",
			"collab.subtitle": "Vom Lead gepflegt und überarbeitet; dieses Panel zeigt sie nur an.",
			"collab.empty": "Noch keine Kollaborationsdatensätze (vom Lead geschrieben)",
			"collab.unavailable": "Die Projektion der Kollaborationsdatensätze ist nicht verfügbar",
			"collab.loading": "Kollaborationsdatensätze werden gelesen…",
			"collab.author": "Autor",
			"collab.revision": "Version {revision}",
			"collab.updated": "Aktualisiert {time}",
			"collab.versions": "Versionshistorie",
			"collab.versionCurrent": "Aktuelle Version",
			"collab.versionsToggle": "Versionshistorie anzeigen",
			"collab.versionsToggleCollapse": "Versionshistorie ausblenden",
			"collab.pending": "Ausstehend",
			"collab.pendingNone": "Keine ausstehenden Einträge",
			"collab.associations": "Explizite Zuordnungen",
			"collab.associationsMissing": "Zuordnungen nicht angegeben",
			"collab.references": "Quellverweise",
			"collab.referencesNone": "Keine Quellverweise angegeben",
			"collab.referenceSame": "Seq {seq} fokussieren",
			"collab.referenceCross": "Quell-Session öffnen",
			"collab.referenceCrossNotice": "Quell-Session \"{sessionId}\" geöffnet; exakte Seq-Fokussierung über Sessions hinweg ist noch nicht angebunden.",
			"collab.referenceFailed": "Quell-Session konnte nicht geöffnet werden: {message}",
			"collab.readonly": "Dieser Abschnitt zeigt nur vom Lead geschriebene Datensätze; er schreibt hier nie.",
			"sidebar.title": "Kollaborationsdatensätze",
			"sidebar.description": "Die Kollaborationsdatensätze des Leads schreibgeschützt anzeigen",
			"header.trigger": "Datensätze",
			"panel.referenceSameUnavailable": "Exakte Seq-Fokussierung erfordert eine native Erweiterung und ist in diesem reduzierten Build nicht verfügbar.",
			"common.unknown": "Unbekannt",
			"common.none": "Keine",
			"time.unknown": "Zeit unbekannt"
		};
		/** Russian dictionary checked against the Chinese key set. */
		/** Russian dictionary checked against the Chinese key set. */
		const ru = {
			"view.workflow": "Рабочий процесс",
			"view.projectSummary": "Сводка проекта",
			"shell.loading": "Загрузка данных проекта…",
			"shell.teamAbsent": "Agent Teams не включён, или этот Session не является Team Lead",
			"shell.teamAbsentHint": "При включённом Agent Teams этот вид показывает реальные Goal, участников, задачи и записи совместной работы; примерные данные никогда не создаются.",
			"shell.projectionError": "Не удалось загрузить данные совместной работы: {message}",
			"shell.projectionUnknownError": "Неизвестная ошибка",
			"shell.goalMissing": "Цель не задана",
			"shell.goalUnavailable": "Проекция Goal недоступна",
			"shell.recordsMissing": "Записей совместной работы пока нет (их пишет Lead)",
			"shell.recordsUnavailable": "Проекция записей совместной работы недоступна (collaboration-records не включён)",
			"shell.noPercent": "Проценты не отображаются: реальных данных о прогрессе нет",
			"goal.phase.active": "В работе",
			"goal.phase.paused": "Приостановлено",
			"goal.phase.blocked": "Заблокировано",
			"goal.phase.complete": "Завершено",
			"goal.rounds": "Использовано {started}/{max} раундов",
			"goal.revision": "Ревизия {revision}",
			"count.members": "Участников: {count}",
			"count.tasks": "Задач: {count}",
			"count.records": "Записей: {count}",
			"count.pending": "Ожидает: {count}",
			"node.goal": "Указание · цель",
			"node.lead": "Lead",
			"node.member": "Участник",
			"node.task": "Задача",
			"node.result": "Запись совместной работы",
			"node.aria": "{kind}: {title}",
			"runtime.running": "Выполняется",
			"runtime.inactive": "Не выполняется",
			"runtime.provisioning": "Подготовка",
			"runtime.failed": "Ошибка",
			"runtime.unknown": "Состояние выполнения неизвестно",
			"task.status.pending": "Ожидает",
			"task.status.in_progress": "В работе",
			"task.status.completed": "Завершено",
			"task.ready": "Готово",
			"task.blocked": "Заблокировано зависимостями",
			"task.blockedBy": "Заблокировано: {ids}",
			"task.revision": "Ревизия {revision}",
			"task.owner": "Ответственный: {name}",
			"task.ownerUnknown": "Не назначено",
			"task.ownerAmbiguous": "Не сопоставлено (дублируется имя участника)",
			"task.writeScopes": "Области записи: {scopes}",
			"label.blockedBy": "Заблокировано",
			"label.writeScopes": "Области записи",
			"label.rounds": "Раунды",
			"edge.goalLead": "Цель → Lead",
			"edge.delegate": "Делегирования",
			"edge.task": "Владеет",
			"edge.result": "Явная связь",
			"edge.memberResult": "Связь записи",
			"edge.aria": "{from} → {to}: {label}",
			"attention.title": "Требует вашего подтверждения",
			"attention.count": "Элементов: {count}",
			"attention.clear": "Нет ожидающих элементов",
			"attention.hint": "Ожидающие элементы берутся из поля pending последних записей совместной работы Lead. Просмотр деталей их не удаляет; только новая ревизия Lead, обработавшая элемент, убирает его.",
			"attention.record": "Запись «{title}» · ревизия {revision}",
			"attention.locate": "Перейти: {text}",
			"toolbar.fit": "Показать всё (F)",
			"toolbar.layout": "Упорядочить",
			"toolbar.detail": "Детали",
			"toolbar.detailHide": "Скрыть детали",
			"toolbar.zoomIn": "Увеличить",
			"toolbar.zoomOut": "Уменьшить",
			"toolbar.help": "Нажмите на узел для деталей · F — показать всё · Esc восстановит вид до фокуса",
			"canvas.aria": "Холст рабочего процесса проекта",
			"canvas.shortcuts": "F — показать всё, Esc — восстановить вид до фокуса",
			"canvas.edgeLabel": "{label}",
			"detail.title": "Детали",
			"detail.close": "Закрыть детали",
			"detail.empty": "Выберите узел или связь, чтобы увидеть детали",
			"detail.kind": "Тип",
			"detail.status": "Статус",
			"detail.runtime": "Состояние выполнения",
			"detail.runtimeHint": "Состояние выполнения берётся из живого статуса Session; неизвестное значение никогда не показывается как простой.",
			"detail.lifecycle": "Жизненный цикл",
			"detail.unknown": "Неизвестно",
			"detail.author": "Автор",
			"detail.revision": "Версия {revision}",
			"detail.updated": "Обновлено {time}",
			"detail.summary": "Сводка",
			"detail.content": "Содержание",
			"detail.recordId": "ID записи",
			"detail.associations": "Явные связи",
			"detail.associationsTasks": "Задачи",
			"detail.associationsMembers": "Участники",
			"detail.associationsMissing": "Связи не предоставлены",
			"detail.pending": "Ожидающие элементы",
			"detail.pendingNone": "Нет ожидающих элементов",
			"detail.pendingHint": "Просмотр их не удаляет; только новая ревизия Lead, удалившая элемент, очищает его.",
			"detail.versions": "История версий",
			"detail.versionsCount": "Версий: {count}",
			"detail.versionEntry": "Ревизия {revision} · seq {seq}",
			"detail.references": "Исходные ссылки",
			"detail.referencesNone": "Исходные ссылки не предоставлены",
			"detail.referenceMeta": "{sessionId} · seq {seq}",
			"detail.referenceSame": "Перейти к seq {seq}",
			"detail.referenceCross": "Открыть исходный Session",
			"detail.referenceCrossNotice": "Открыт исходный Session «{sessionId}»; точный переход к seq между Session пока не подключён.",
			"detail.referenceFailed": "Не удалось открыть исходный Session: {message}",
			"detail.owner": "Владелец",
			"detail.tasksOwned": "Собственные задачи",
			"detail.resultsAssociated": "Связанные записи совместной работы",
			"detail.resultsNone": "Связанных записей нет",
			"detail.relations": "Связей: {count}",
			"detail.edgeFrom": "От",
			"detail.edgeTo": "К",
			"detail.edgeKind": "Связь",
			"detail.recordsHint": "Lead ведёт и пересматривает эти записи; этот вид только показывает их и ничего не записывает.",
			"detail.goal": "Цель",
			"detail.objective": "Содержание цели",
			"summary.title": "Сводка проекта",
			"summary.subtitle": "Те же реальные данные проекции, что и в графе рабочего процесса",
			"summary.goal": "Цель",
			"summary.members": "Участники",
			"summary.tasks": "Задачи",
			"summary.records": "Записи совместной работы",
			"summary.attention": "Ожидает",
			"summary.membersNone": "Участников нет",
			"summary.tasksNone": "Общих задач нет",
			"summary.recordsNone": "Записей совместной работы пока нет (их пишет Lead)",
			"summary.pending": "Ожидает: {count}",
			"summary.pendingNone": "Ничего не ожидает",
			"summary.author": "Автор",
			"summary.updated": "Обновлено",
			"summary.versions": "Версий: {count}",
			"summary.taskCount": "Элементов: {count}",
			"summary.runtime": "Живое состояние выполнения",
			"summary.associationsMissing": "Связи не предоставлены",
			"summary.blockedBy": "Заблокировано: {ids}",
			"summary.ready": "Готово",
			"summary.live": "Состояние выполнения участников берётся из живого статуса Session",
			"summary.unowned": "Не назначено",
			"summary.ownerAmbiguous": "Не сопоставлено (дублируется имя участника)",
			"summary.openInWorkflow": "Показать в рабочем процессе",
			"collab.title": "Записи совместной работы Lead",
			"collab.subtitle": "Lead ведёт и пересматривает их; панель только показывает записи.",
			"collab.empty": "Записей совместной работы пока нет (их пишет Lead)",
			"collab.unavailable": "Проекция записей совместной работы недоступна",
			"collab.loading": "Чтение записей совместной работы…",
			"collab.author": "Автор",
			"collab.revision": "Версия {revision}",
			"collab.updated": "Обновлено {time}",
			"collab.versions": "История версий",
			"collab.versionCurrent": "Текущая версия",
			"collab.versionsToggle": "Показать историю версий",
			"collab.versionsToggleCollapse": "Скрыть историю версий",
			"collab.pending": "Ожидает",
			"collab.pendingNone": "Нет ожидающих элементов",
			"collab.associations": "Явные связи",
			"collab.associationsMissing": "Связи не предоставлены",
			"collab.references": "Исходные ссылки",
			"collab.referencesNone": "Исходные ссылки не предоставлены",
			"collab.referenceSame": "Перейти к seq {seq}",
			"collab.referenceCross": "Открыть исходный Session",
			"collab.referenceCrossNotice": "Открыт исходный Session «{sessionId}»; точный переход к seq между Session пока не подключён.",
			"collab.referenceFailed": "Не удалось открыть исходный Session: {message}",
			"collab.readonly": "Этот раздел только показывает записи, написанные Lead; здесь ничего не записывается.",
			"sidebar.title": "Записи совместной работы",
			"sidebar.description": "Просмотр записей совместной работы Lead только для чтения",
			"header.trigger": "Записи",
			"panel.referenceSameUnavailable": "Точный переход к seq требует нативного расширения и недоступен в этой упрощённой версии.",
			"common.unknown": "Неизвестно",
			"common.none": "Нет",
			"time.unknown": "Время неизвестно"
		};
		/** Portuguese dictionary checked against the Chinese key set. */
		/** Portuguese dictionary checked against the Chinese key set. */
		const pt = {
			"view.workflow": "Fluxo de trabalho",
			"view.projectSummary": "Resumo do projeto",
			"shell.loading": "Carregando dados do projeto…",
			"shell.teamAbsent": "Agent Teams não está habilitado, ou esta Session não é um Team Lead",
			"shell.teamAbsentHint": "Com o Agent Teams habilitado, esta visualização mostra o Goal, os membros, as tarefas e os registros de colaboração reais; nunca inventa dados de exemplo.",
			"shell.projectionError": "Não foi possível carregar os dados de colaboração: {message}",
			"shell.projectionUnknownError": "Erro desconhecido",
			"shell.goalMissing": "Nenhum objetivo definido",
			"shell.goalUnavailable": "A projeção de Goal não está disponível",
			"shell.recordsMissing": "Ainda não há registros de colaboração (escritos pelo Lead)",
			"shell.recordsUnavailable": "A projeção de registros de colaboração não está disponível (collaboration-records não habilitado)",
			"shell.noPercent": "Nenhuma porcentagem é exibida: não há dados reais de progresso",
			"goal.phase.active": "Em andamento",
			"goal.phase.paused": "Pausado",
			"goal.phase.blocked": "Bloqueado",
			"goal.phase.complete": "Concluído",
			"goal.rounds": "{started}/{max} rodadas usadas",
			"goal.revision": "Revisão {revision}",
			"count.members": "{count} membros",
			"count.tasks": "{count} tarefas",
			"count.records": "{count} registros",
			"count.pending": "{count} pendentes",
			"node.goal": "Indicação · objetivo",
			"node.lead": "Lead",
			"node.member": "Membro",
			"node.task": "Tarefa",
			"node.result": "Registro de colaboração",
			"node.aria": "{kind}: {title}",
			"runtime.running": "Em execução",
			"runtime.inactive": "Parado",
			"runtime.provisioning": "Preparando",
			"runtime.failed": "Falhou",
			"runtime.unknown": "Estado de execução desconhecido",
			"task.status.pending": "Pendente",
			"task.status.in_progress": "Em andamento",
			"task.status.completed": "Concluído",
			"task.ready": "Pronto",
			"task.blocked": "Bloqueado por dependências",
			"task.blockedBy": "Bloqueado por: {ids}",
			"task.revision": "Revisão {revision}",
			"task.owner": "Responsável: {name}",
			"task.ownerUnknown": "Não atribuído",
			"task.ownerAmbiguous": "Não correspondido (nome de membro duplicado)",
			"task.writeScopes": "Escopos de escrita: {scopes}",
			"label.blockedBy": "Bloqueado por",
			"label.writeScopes": "Escopos de escrita",
			"label.rounds": "Rodadas",
			"edge.goalLead": "Objetivo → Lead",
			"edge.delegate": "Delegações",
			"edge.task": "Possui",
			"edge.result": "Associação explícita",
			"edge.memberResult": "Associação de registro",
			"edge.aria": "{from} para {to}: {label}",
			"attention.title": "Precisa da sua confirmação",
			"attention.count": "{count} itens",
			"attention.clear": "Nenhum item pendente",
			"attention.hint": "Os itens pendentes vêm do campo pending dos registros de colaboração mais recentes do Lead. Ver os detalhes não os limpa; apenas uma nova revisão do Lead que processe o item os remove.",
			"attention.record": "Registro \"{title}\" · revisão {revision}",
			"attention.locate": "Localizar: {text}",
			"toolbar.fit": "Ajustar (F)",
			"toolbar.layout": "Organizar layout",
			"toolbar.detail": "Detalhes",
			"toolbar.detailHide": "Ocultar detalhes",
			"toolbar.zoomIn": "Aproximar",
			"toolbar.zoomOut": "Afastar",
			"toolbar.help": "Clique em um nó para detalhes · F para ajustar · Esc restaura a visualização anterior ao foco",
			"canvas.aria": "Tela do fluxo de trabalho do projeto",
			"canvas.shortcuts": "Pressione F para ajustar, Esc para restaurar a visualização anterior ao foco",
			"canvas.edgeLabel": "{label}",
			"detail.title": "Detalhes",
			"detail.close": "Fechar detalhes",
			"detail.empty": "Selecione um nó ou relação para ver seus detalhes",
			"detail.kind": "Tipo",
			"detail.status": "Status",
			"detail.runtime": "Estado de execução",
			"detail.runtimeHint": "O estado de execução vem do status Session ao vivo; um valor desconhecido nunca é mostrado como ocioso.",
			"detail.lifecycle": "Ciclo de vida",
			"detail.unknown": "Desconhecido",
			"detail.author": "Autor",
			"detail.revision": "Versão {revision}",
			"detail.updated": "Atualizado {time}",
			"detail.summary": "Resumo",
			"detail.content": "Conteúdo",
			"detail.recordId": "ID do registro",
			"detail.associations": "Associações explícitas",
			"detail.associationsTasks": "Tarefas",
			"detail.associationsMembers": "Membros",
			"detail.associationsMissing": "Associações não fornecidas",
			"detail.pending": "Itens pendentes",
			"detail.pendingNone": "Nenhum item pendente",
			"detail.pendingHint": "Ver não os limpa; apenas uma nova revisão do Lead que remova o item o limpa.",
			"detail.versions": "Histórico de versões",
			"detail.versionsCount": "{count} versões",
			"detail.versionEntry": "Revisão {revision} · seq {seq}",
			"detail.references": "Referências de origem",
			"detail.referencesNone": "Nenhuma referência de origem fornecida",
			"detail.referenceMeta": "{sessionId} · seq {seq}",
			"detail.referenceSame": "Focar seq {seq}",
			"detail.referenceCross": "Abrir Session de origem",
			"detail.referenceCrossNotice": "Session de origem \"{sessionId}\" aberta; o foco exato por seq entre Sessions ainda não está conectado.",
			"detail.referenceFailed": "Não foi possível abrir a Session de origem: {message}",
			"detail.owner": "Proprietário",
			"detail.tasksOwned": "Tarefas próprias",
			"detail.resultsAssociated": "Registros de colaboração associados",
			"detail.resultsNone": "Nenhum registro associado",
			"detail.relations": "{count} relações",
			"detail.edgeFrom": "De",
			"detail.edgeTo": "Para",
			"detail.edgeKind": "Relação",
			"detail.recordsHint": "O Lead mantém e revisa estes registros; esta visualização apenas os exibe e nunca escreve.",
			"detail.goal": "Objetivo",
			"detail.objective": "Objetivo",
			"summary.title": "Resumo do projeto",
			"summary.subtitle": "Os mesmos dados reais de projeção do grafo de fluxo de trabalho",
			"summary.goal": "Objetivo",
			"summary.members": "Membros",
			"summary.tasks": "Tarefas",
			"summary.records": "Registros de colaboração",
			"summary.attention": "Pendente",
			"summary.membersNone": "Nenhum membro",
			"summary.tasksNone": "Nenhuma tarefa compartilhada",
			"summary.recordsNone": "Ainda não há registros de colaboração (escritos pelo Lead)",
			"summary.pending": "{count} pendentes",
			"summary.pendingNone": "Nada pendente",
			"summary.author": "Autor",
			"summary.updated": "Atualizado",
			"summary.versions": "{count} versões",
			"summary.taskCount": "{count} itens",
			"summary.runtime": "Estado de execução ao vivo",
			"summary.associationsMissing": "Associações não fornecidas",
			"summary.blockedBy": "Bloqueado por: {ids}",
			"summary.ready": "Pronto",
			"summary.live": "O estado de execução dos membros vem do status Session ao vivo",
			"summary.unowned": "Não atribuído",
			"summary.ownerAmbiguous": "Não correspondido (nome de membro duplicado)",
			"summary.openInWorkflow": "Ver no fluxo de trabalho",
			"collab.title": "Registros de colaboração do Lead",
			"collab.subtitle": "Mantidos e revisados pelo Lead; este painel apenas os exibe.",
			"collab.empty": "Ainda não há registros de colaboração (escritos pelo Lead)",
			"collab.unavailable": "A projeção de registros de colaboração não está disponível",
			"collab.loading": "Lendo registros de colaboração…",
			"collab.author": "Autor",
			"collab.revision": "Versão {revision}",
			"collab.updated": "Atualizado {time}",
			"collab.versions": "Histórico de versões",
			"collab.versionCurrent": "Versão atual",
			"collab.versionsToggle": "Mostrar histórico de versões",
			"collab.versionsToggleCollapse": "Ocultar histórico de versões",
			"collab.pending": "Pendente",
			"collab.pendingNone": "Nenhum item pendente",
			"collab.associations": "Associações explícitas",
			"collab.associationsMissing": "Associações não fornecidas",
			"collab.references": "Referências de origem",
			"collab.referencesNone": "Nenhuma referência de origem fornecida",
			"collab.referenceSame": "Focar seq {seq}",
			"collab.referenceCross": "Abrir Session de origem",
			"collab.referenceCrossNotice": "Session de origem \"{sessionId}\" aberta; o foco exato por seq entre Sessions ainda não está conectado.",
			"collab.referenceFailed": "Não foi possível abrir a Session de origem: {message}",
			"collab.readonly": "Esta seção apenas exibe registros escritos pelo Lead; ela nunca escreve aqui.",
			"sidebar.title": "Registros de colaboração",
			"sidebar.description": "Consultar os registros de colaboração do Lead somente leitura",
			"header.trigger": "Registros",
			"panel.referenceSameUnavailable": "O foco exato por seq exige uma extensão nativa e não está disponível nesta versão simplificada.",
			"common.unknown": "Desconhecido",
			"common.none": "Nenhum",
			"time.unknown": "Hora desconhecida"
		};
		//#endregion
		//#region lib/types/client/mount.js
		/** Registry id of the records tab type; also the key its body registers under. */
		const RECORDS_ID = "client-ui-project-space/collaboration-records";
		/** Kind of the records page tab opened through `ctx.sidebarRight.openTab`. */
		const RECORDS_KIND = "collaboration-records";
		/** Required browser services: Conversation views, Workspace navigation, right Sidebar, slots, and locale. */
		const inject = [
			"uiWorkspace",
			"slots",
			"locale",
			"sidebarRightTabs",
			"sidebarRight"
		];
		/**
		* Register the project-space locale dictionaries, its two Conversation Views,
		* the native right-Sidebar records tab (type + body), and the header entry that
		* opens it. Every registration rides the caller's fiber effect, so unloading the
		* plugin removes all of them.
		* @param ctx - Client Context carrying Workspace navigation, the right Sidebar, slots, and locale.
		*/
		function registerProjectSpaceUi(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en,
				ja,
				es,
				fr,
				de,
				ru,
				pt
			}), "client-ui-project-space: dictionaries");
			const t = ctx.locale.bind(NS);
			const openSourceSession = (sessionId) => (sourceSessionId) => {
				ctx.uiWorkspace.openSession({
					parentSessionId: sessionId,
					childSessionId: sourceSessionId,
					mode: "continuable"
				});
			};
			ctx.effect(() => ctx.sidebarRightTabs.register({
				id: RECORDS_ID,
				kind: RECORDS_KIND,
				keepMounted: true,
				title: () => t("sidebar.title"),
				guide: [{
					id: "records",
					order: 100,
					title: () => t("sidebar.title"),
					description: () => t("sidebar.description")
				}]
			}), "client-ui-project-space: sidebar records tab type");
			ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: RECORDS_ID,
				locale: NS,
				inject: (sessionId) => ({ openSourceSession: openSourceSession(sessionId) })
			}, RecordsPanel));
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "collaboration-records",
				order: -10,
				locale: NS,
				inject: () => ({ openRecords: () => {
					try {
						ctx.sidebarRight.openTab(RECORDS_KIND);
					} catch (error) {
						ctx.logger.warn("project-space: opening the records tab failed: %s", error);
					}
				} })
			}, RecordsHeaderAction));
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "workflow",
				order: 2,
				locale: NS,
				label: () => t("view.workflow"),
				inject: (sessionId) => ({ openSourceSession: openSourceSession(sessionId) })
			}, WorkflowView));
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "project-summary",
				order: 3,
				locale: NS,
				label: () => t("view.projectSummary"),
				inject: (sessionId) => ({ openSourceSession: openSourceSession(sessionId) })
			}, ProjectSummaryView));
		}
		//#endregion
		//#region lib/types/client/index.js
		/**
		* Register the project-space Views, the native right-Sidebar records tab, the
		* header entry, and the locale dictionaries on the Client Context.
		* @param ctx - Client Context with the declared `inject` services available.
		*/
		function apply(ctx) {
			registerProjectSpaceUi(ctx);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map