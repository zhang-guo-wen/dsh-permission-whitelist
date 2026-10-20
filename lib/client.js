window.__ModuleLoader__.load({
	id: "@guowenzhang/dsh-permission-whitelist",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		//#region src/client/remote.ts
		/**
		* Client-side declaration of this plugin's Remote methods.
		*
		* A generated Typert contribution would produce exactly this shape; the package
		* ships the description by hand instead so the browser can mount the namespace
		* without a build-time generator. Each entry must name the Host method, its
		* namespace, and the one `request` parameter the Host methods declare, because
		* the Gateway matches calls by that wire identity.
		*
		* @module @guowenzhang/dsh-permission-whitelist/client/remote
		*/
		/** Cordis service key and wire namespace, matching the Host service. */
		const REMOTE_NAMESPACE$1 = "permissionWhitelist";
		/** Methods the Host service publishes. */
		const METHODS = ["previewRule", "appendAllowRule"];
		/**
		* Build a pass-through codec for one wire position.
		* @param typeSymbol - the identity recorded in the descriptor.
		* @returns the codec the Gateway expects.
		*/
		function codec(typeSymbol) {
			const schema = { parse: (value) => value };
			return {
				mode: "strict",
				typeSymbol,
				schema,
				create: () => schema
			};
		}
		/**
		* Describe one Remote method.
		* @param method - the Host method name.
		* @returns its descriptor.
		*/
		function descriptor(method) {
			const owner = `@guowenzhang/dsh-permission-whitelist#${REMOTE_NAMESPACE$1}/${method}`;
			return {
				id: owner,
				service: REMOTE_NAMESPACE$1,
				namespace: REMOTE_NAMESPACE$1,
				method,
				invocation: { kind: "direct" },
				parameters: [{
					name: "request",
					wire: "request",
					source: "json",
					codec: codec(`${owner}:request`)
				}],
				result: codec(`${owner}:result`)
			};
		}
		/** The complete contribution `ctx.remote.$mount` registers. */
		const TYPERT_REMOTE = {
			package: "@guowenzhang/dsh-permission-whitelist",
			descriptors: METHODS.map(descriptor)
		};
		//#endregion
		//#region \0dsh-css:C:\02-codespace\DeepSeek\dsh-permission-whitelist\src\client\AlwaysAllowPill.module.css.mjs
		const css$1 = ".d3eKVq_root{z-index:1100;pointer-events:auto;box-sizing:border-box;align-items:center;gap:8px;max-width:min(560px,100vw - 48px);display:flex;position:fixed}.d3eKVq_root button{white-space:nowrap;color:var(--dsw-alias-state-error-primary);border:1px solid var(--dsw-alias-state-error-primary);transition:background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out), border-color var(--ds-transition-duration-fast) var(--ds-ease-in-out);background:0 0;flex:none}.d3eKVq_root button:hover:not(:disabled){background:var(--dsw-alias-interactive-hover-danger)}.d3eKVq_root button:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.d3eKVq_command{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;flex:0 auto;min-width:0;max-width:260px;overflow:hidden}.d3eKVq_note{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-bg-overlay);border-radius:var(--dsw-radius-sm);white-space:nowrap;flex:none;padding:2px 6px}@media (pointer:coarse){.d3eKVq_root button{min-height:44px}}@media (prefers-reduced-motion:reduce){.d3eKVq_root button{transition:none}}";
		const tagId$1 = "@guowenzhang/dsh-permission-whitelist/AlwaysAllowPill.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var AlwaysAllowPill_module_css_default = {
			"command": "d3eKVq_command",
			"note": "d3eKVq_note",
			"root": "d3eKVq_root"
		};
		//#endregion
		//#region src/client/AlwaysAllowPill.tsx
		/**
		* Floating "always allow" action for the pending approval.
		*
		* The approval panel owns its only child slot as a single cell and the composer
		* dock does not render while an approval takes over the composer, so there is no
		* extension point inside the panel. This entry mounts into `shell.overlay` — the
		* frame-wide, click-through floating layer the host reserves for additive
		* surfaces — and anchors itself to the panel's own `data-approval-key` element,
		* above the card's top-left corner. Nothing in the host's approval UI is
		* replaced or registered over.
		*
		* The pill names the command it applies to, truncated when long, so the action
		* is never ambiguous about which call it covers.
		*
		* @module @guowenzhang/dsh-permission-whitelist/client/AlwaysAllowPill
		*/
		/** Space between the card's bottom edge and the pill, in pixels. */
		const GAP_PX = 8;
		/** Button height used for vertical alignment against the card's action row. */
		const BUTTON_HEIGHT_PX = 36;
		/** How often the anchor is re-measured, in milliseconds. */
		const POLL_MS = 250;
		/** The approval panel's own root, used as the anchor. */
		const CARD_SELECTOR = "[data-approval-key]";
		/** The scroll container that carries the card's command detail. */
		const BODY_SELECTOR = "[data-approval-scroll]";
		/**
		* Read the command the approval is about.
		*
		* The panel renders the correlated shell command in its own element, whose class
		* keeps the semantic `command` prefix across the CSS-module hash. When no such
		* element exists the card's text is the best available answer.
		* @param card - the approval panel's root element.
		* @returns the command line, possibly empty.
		*/
		function commandOf(card) {
			const text = ((card.querySelector(BODY_SELECTOR) ?? card).querySelector("[class*=\"command\"]")?.textContent ?? "").trim();
			if (text.length > 0) return text;
			return (card.textContent ?? "").trim();
		}
		/**
		* Measure the approval card.
		* @returns its box and command, or undefined when no approval is on screen.
		*/
		function readCard() {
			const card = document.querySelector(CARD_SELECTOR);
			if (card === null) return void 0;
			const box = card.getBoundingClientRect();
			if (box.width === 0 && box.height === 0) return void 0;
			return {
				top: box.top,
				bottom: box.bottom,
				left: box.left,
				command: commandOf(card),
				row: rowOf(card)
			};
		}
		/**
		* Measure the card's action row — the line holding its own buttons.
		*
		* Joining that row puts this action where a user already looks for one, instead
		* of floating beside the card. The class keeps its semantic `actionRow` prefix
		* across the CSS-module hash.
		* @param card - the approval panel's root element.
		* @returns the row's box, or undefined when the panel renders none.
		*/
		function rowOf(card) {
			const row = card.querySelector("[class*=\"actionRow\"]");
			if (row === null) return void 0;
			const box = (row.querySelector("button") ?? row).getBoundingClientRect();
			if (box.width === 0 && box.height === 0) return void 0;
			return {
				top: box.top,
				left: box.left,
				height: box.height
			};
		}
		/**
		* Answer the waiting approval the way the host's own "allow once" does.
		*
		* The Remote protocol carries no handle to the pending request, so the action
		* answers through the panel's own control: clicking it is exactly what a user
		* would do, and it settles the call instead of leaving the panel waiting after a
		* rule was already written.
		* @returns whether a control was found and clicked.
		*/
		function dismissApproval() {
			const card = document.querySelector(CARD_SELECTOR);
			if (card === null) return false;
			const buttons = [...card.querySelectorAll("button")];
			const allow = buttons.find((button) => /允许一次|allow once/iu.test(button.textContent ?? "")) ?? buttons.at(-1);
			if (allow === void 0) return false;
			allow.click();
			return true;
		}
		/**
		* Render the floating action below the pending approval's card.
		* @param props - locale and the injected face.
		* @returns the positioned pill, or null when no approval is on screen.
		*/
		function AlwaysAllowPill(props) {
			const t = props.t;
			const [card, setCard] = (0, react.useState)(void 0);
			/**
			* The rule this click would add: `undefined` while it is being derived, `null`
			* when the card's text is not a command (an escalation reason, for instance).
			* The action only appears once a real rule exists, so a click can never fail
			* with "cannot be reduced to a rule".
			*/
			const [entry, setEntry] = (0, react.useState)(void 0);
			const [message, setMessage] = (0, react.useState)(void 0);
			(0, react.useEffect)(() => {
				const tick = () => {
					setCard(readCard());
				};
				tick();
				const timer = setInterval(tick, POLL_MS);
				return () => {
					clearInterval(timer);
				};
			}, []);
			(0, react.useEffect)(() => {
				let active = true;
				if (card === void 0 || card.command.length === 0) {
					setEntry(null);
					return () => {
						active = false;
					};
				}
				props.preview(card.command).then((value) => {
					if (active) setEntry(value);
				}, () => {
					if (active) setEntry(null);
				});
				return () => {
					active = false;
				};
			}, [card?.command, props]);
			if (card === void 0) return null;
			if (entry === void 0 || entry === null) return null;
			const click = async () => {
				setMessage(void 0);
				try {
					const result = await props.commit(card.command);
					setEntry(result.entry);
					if (!dismissApproval()) setMessage(t("savedOnly", { entry: result.entry }));
				} catch (error) {
					setMessage(t("failed", { message: error instanceof Error ? error.message : String(error) }));
				}
			};
			const style = card.row === void 0 ? {
				top: `${card.bottom + GAP_PX}px`,
				left: `${card.left}px`
			} : {
				top: `${card.row.top + (card.row.height - BUTTON_HEIGHT_PX) / 2}px`,
				left: `${card.row.left - GAP_PX}px`,
				transform: "translateX(-100%)"
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: AlwaysAllowPill_module_css_default.root,
				style,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						title: entry === null ? void 0 : t("ruleHint", { entry }),
						onClick: () => {
							click();
						},
						children: t("alwaysAllow")
					}),
					card.command.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: AlwaysAllowPill_module_css_default.command,
						title: card.command,
						children: card.command
					}),
					message !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: AlwaysAllowPill_module_css_default.note,
						role: "status",
						children: message
					})
				]
			});
		}
		//#endregion
		//#region \0dsh-css:C:\02-codespace\DeepSeek\dsh-permission-whitelist\src\client\SettingsSection.module.css.mjs
		const css = "._8cNSwa_root{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);flex-direction:column;display:flex}._8cNSwa_heading{font:var(--dsw-font-s-14);margin:0 0 2px;font-weight:500}._8cNSwa_rows{flex-direction:column;display:flex}._8cNSwa_row{border-bottom:.5px solid var(--dsw-alias-border-l2);justify-content:space-between;align-items:flex-start;gap:24px;padding:16px 0;display:flex}._8cNSwa_rows>._8cNSwa_row:last-child{border-bottom:none}._8cNSwa_copy{flex-direction:column;gap:2px;min-width:0;display:flex}._8cNSwa_label{font:var(--dsw-font-s-14)}._8cNSwa_line{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}._8cNSwa_note{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}._8cNSwa_row[data-phase=failed] ._8cNSwa_note{color:var(--dsw-alias-state-error-primary)}._8cNSwa_row[data-phase=saved] ._8cNSwa_note{color:var(--dsw-alias-state-success-primary)}._8cNSwa_footnote{border-top:.5px solid var(--dsw-alias-border-l2);font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere;flex-direction:column;gap:2px;padding-top:12px;display:flex}._8cNSwa_footnoteTitle{font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-secondary)}@media (pointer:coarse){._8cNSwa_row{min-height:44px}}";
		const tagId = "@guowenzhang/dsh-permission-whitelist/SettingsSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var SettingsSection_module_css_default = {
			"copy": "_8cNSwa_copy",
			"footnote": "_8cNSwa_footnote",
			"footnoteTitle": "_8cNSwa_footnoteTitle",
			"heading": "_8cNSwa_heading",
			"label": "_8cNSwa_label",
			"line": "_8cNSwa_line",
			"note": "_8cNSwa_note",
			"root": "_8cNSwa_root",
			"row": "_8cNSwa_row",
			"rows": "_8cNSwa_rows"
		};
		//#endregion
		//#region src/client/SettingsSection.tsx
		/**
		* Settings section: one row per switch, each with its own save state.
		*
		* Colors come only from `--dsw-alias-*` semantic aliases; copy comes from the
		* typed dictionary. Nothing here is hover-only.
		*
		* @module @guowenzhang/dsh-permission-whitelist/client/SettingsSection
		*/
		/** The rows, in the order the page presents them. */
		const SWITCH_ROWS = [{
			name: "enabled",
			label: "bypass.label",
			on: "bypass.on",
			off: "bypass.off"
		}, {
			name: "logDecisions",
			label: "rules.logLabel",
			on: "rules.logOn",
			off: "rules.logOff"
		}];
		/** Render the save note beside one switch. */
		function saveNote(save, t) {
			switch (save.phase) {
				case "saving": return t("bypass.saving");
				case "saved": return t("bypass.saved");
				case "failed": return `${t("bypass.failed")}: ${save.message}`;
				default: return;
			}
		}
		/**
		* Render the permission allowlist section.
		* @param props - section runtime, locale, and injected face.
		* @returns the settings section body.
		*/
		function SettingsSection(props) {
			const state = props.useWhitelistSettings((snapshot) => snapshot);
			const t = props.t;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SettingsSection_module_css_default.root,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: SettingsSection_module_css_default.heading,
						children: t("bypass.title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SettingsSection_module_css_default.rows,
						children: SWITCH_ROWS.map((row) => {
							const checked = state[row.name];
							const save = state.saves[row.name];
							const note = saveNote(save, t);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: SettingsSection_module_css_default.row,
								"data-phase": save.phase,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: SettingsSection_module_css_default.copy,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: SettingsSection_module_css_default.label,
											children: t(row.label)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: SettingsSection_module_css_default.line,
											children: t(checked ? row.on : row.off)
										}),
										note !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: SettingsSection_module_css_default.note,
											role: "status",
											children: note
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
									checked,
									label: t(row.label),
									disabled: !state.writable || save.phase === "saving",
									onChange: () => {
										props.toggle(row.name);
									}
								})]
							}, row.name);
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SettingsSection_module_css_default.footnote,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: SettingsSection_module_css_default.footnoteTitle,
							children: t("source.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: t("source.hint") })]
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Copy for this plugin's settings section.
		*
		* Every product-visible string lives here. `en` is typed against the Chinese
		* dictionary, so a new entry cannot ship untranslated.
		*
		* @module @guowenzhang/dsh-permission-whitelist/client/locales
		*/
		/** Locale namespace owned by this plugin's settings section. */
		const NS = "settings.permissionWhitelist";
		/** Settings-section keys. */
		const zh = {
			"nav": "权限白名单",
			"bypass.title": "命令白名单",
			"bypass.on": "白名单命中的命令不再询问，并直接在工作区外执行（不受文件沙箱限制）",
			"bypass.off": "白名单不生效：所有命令仍走沙箱与审批，与未安装本插件时相同",
			"bypass.label": "启用命令白名单",
			"bypass.saving": "保存中",
			"bypass.saved": "已保存",
			"bypass.failed": "保存失败",
			"source.title": "添加与查看规则",
			"source.hint": "在输入框使用 /allow <命令>（加 --user 写入用户级配置）；不带参数则列出当前规则。审批出现时，卡片右侧也会浮出「总是允许」按钮。",
			"rules.logLabel": "记录判定",
			"rules.logOn": "每条命令的放行、询问与拒绝都写进宿主日志，便于调整规则",
			"rules.logOff": "不再记录判定结果"
		};
		/** English dictionary, complete against {@link SectionKey}. */
		const en = {
			"nav": "Permission allowlist",
			"bypass.title": "Command allowlist",
			"bypass.on": "Allowlisted commands stop asking and run outside the workspace, without the file sandbox.",
			"bypass.off": "The allowlist is off: every command uses the sandbox and the approval prompt, as if this plugin were absent.",
			"bypass.label": "Enable the command allowlist",
			"bypass.saving": "Saving",
			"bypass.saved": "Saved",
			"bypass.failed": "Save failed",
			"source.title": "Add and inspect rules",
			"source.hint": "Use /allow <command> in the composer (add --user for the user settings file); with no argument it lists the current rules. While an approval is pending, an Always allow button floats beside its card.",
			"rules.logLabel": "Log decisions",
			"rules.logOn": "Write each allow, ask, and deny decision to the host log while tuning rules",
			"rules.logOff": "Stop recording decisions"
		};
		/** Locale namespace for the floating approval action. */
		const APPROVAL_NS = "approval.permissionWhitelist";
		/** Floating approval action copy. */
		const approvalZh = {
			"alwaysAllow": "总是允许",
			"copied": "已复制，粘贴到输入框执行",
			"ruleHint": "将添加规则：{entry}",
			"saved": "已加入白名单并允许本次",
			"savedOnly": "已加入白名单：{entry}，请手动点「允许一次」完成本次",
			"failed": "操作失败：{message}"
		};
		/** English floating-approval copy, complete against {@link ApprovalKey}. */
		const approvalEn = {
			"alwaysAllow": "Always allow",
			"copied": "Copied — paste it into the composer",
			"ruleHint": "Rule to add: {entry}",
			"saved": "Added to the allowlist and allowed this call",
			"savedOnly": "Added to the allowlist: {entry} — approve this call manually",
			"failed": "Could not complete: {message}"
		};
		//#endregion
		//#region src/client/settings-controller.ts
		/**
		* Controller bridging the Host `permission-whitelist` settings namespace onto
		* the settings section snapshot.
		*
		* A flip is asynchronous, so the section shows 保存中 / 已保存 / 失败 beside the
		* switch that was flipped, and the Host's committed value stays the source of
		* the switch position (a failed write therefore leaves the switch where it was).
		*
		* @module @guowenzhang/dsh-permission-whitelist/client/settings-controller
		*/
		/** Settings namespace: the Loader row id of this plugin. */
		const SETTINGS_NS = "permission-whitelist";
		/** The resting write state, shared because it carries no per-switch data. */
		const IDLE = { phase: "idle" };
		/** How long a successful write keeps its note before the row goes quiet. */
		const SAVED_NOTE_MS = 2e3;
		/** Owner handle over the `permission-whitelist` namespace. */
		var WhitelistSettingsController = class {
			scope;
			store;
			unsubscribe;
			saves = /* @__PURE__ */ new Map();
			saveTimers = /* @__PURE__ */ new Map();
			/**
			* @param scope - the `permission-whitelist` configuration form.
			*/
			constructor(scope) {
				this.scope = scope;
				this.store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(this.projection());
				this.unsubscribe = scope.subscribe(() => this.publish());
			}
			/** Stop observing settings and drop pending note timers. */
			dispose() {
				this.unsubscribe();
				for (const timer of this.saveTimers.values()) clearTimeout(timer);
				this.saveTimers.clear();
			}
			/** Build the renderer face for this section. */
			inject() {
				return {
					hooks: { whitelistSettings: this.store },
					toggle: (name) => this.toggle(name)
				};
			}
			async toggle(name) {
				const snapshot = this.scope.getSnapshot();
				if (snapshot.status !== "ready" || !snapshot.writable) return;
				const value = snapshot.value?.[name];
				if (value === void 0) return;
				this.setSave(name, { phase: "saving" });
				try {
					await this.scope.set(name, !value);
				} catch (error) {
					this.setSave(name, {
						phase: "failed",
						message: error instanceof Error ? error.message : String(error)
					});
					return;
				}
				this.setSave(name, { phase: "saved" });
				this.scheduleNoteClear(name);
			}
			setSave(name, save) {
				this.saves.set(name, save);
				this.publish();
			}
			scheduleNoteClear(name) {
				const previous = this.saveTimers.get(name);
				if (previous !== void 0) clearTimeout(previous);
				this.saveTimers.set(name, setTimeout(() => {
					this.saveTimers.delete(name);
					if (this.saves.get(name)?.phase === "saved") this.setSave(name, IDLE);
				}, SAVED_NOTE_MS));
			}
			projection() {
				const snapshot = this.scope.getSnapshot();
				return {
					available: snapshot.status === "ready",
					writable: snapshot.writable,
					enabled: snapshot.value?.enabled ?? true,
					logDecisions: snapshot.value?.logDecisions ?? true,
					saves: {
						enabled: this.saves.get("enabled") ?? IDLE,
						logDecisions: this.saves.get("logDecisions") ?? IDLE
					}
				};
			}
			publish() {
				this.store.set(this.projection());
			}
		};
		//#endregion
		//#region src/client/index.ts
		/** Remote namespace the Host service publishes. */
		const REMOTE_NAMESPACE = "permissionWhitelist";
		/**
		* Required services: slots, copy, settings forms, and the Remote Gateway.
		*
		* Only `remote` is declared. This half mounts its own namespace, so declaring
		* `remote.permissionWhitelist` here would make the plugin wait for a service it
		* exists to create.
		*/
		const inject = [
			"slots",
			"locale",
			"configForms",
			"remote"
		];
		/** Unwrap one remote result, turning a host failure into a thrown error. */
		function unwrap(value) {
			if (!value.ok) throw new Error(value.error.message);
			return value.value;
		}
		/**
		* Register both surfaces.
		* @param ctx - client root context.
		*/
		async function apply(ctx) {
			const unmountRemote = await ctx.remote.$mount(TYPERT_REMOTE);
			ctx.effect(() => () => unmountRemote(), "permission-whitelist: remote mount");
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "permission-whitelist: settings copy");
			ctx.effect(() => ctx.locale.register(APPROVAL_NS, {
				zh: approvalZh,
				en: approvalEn
			}), "permission-whitelist: action copy");
			const t = ctx.locale.bind(NS);
			const controller = new WhitelistSettingsController(ctx.configForms.get(SETTINGS_NS));
			ctx.effect(() => () => {
				controller.dispose();
			}, "permission-whitelist: settings form");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "permission-whitelist",
				order: 14,
				label: () => t("nav"),
				locale: NS,
				inject: () => controller.inject()
			}, SettingsSection));
			const requireRemote = () => {
				const service = ctx.get(`remote.${REMOTE_NAMESPACE}`);
				if (service === void 0) throw new Error("the permission whitelist host service is not mounted");
				return service;
			};
			ctx.slots.inject("shell.overlay", () => {
				return ctx.slots.register({
					name: "shell.overlay",
					id: "permission-whitelist",
					order: 2,
					locale: APPROVAL_NS,
					inject: () => ({
						preview: async (text) => unwrap(await requireRemote().previewRule({ command: text })).entry,
						commit: async (text) => unwrap(await requireRemote().appendAllowRule({ command: text }))
					})
				}, AlwaysAllowPill);
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
