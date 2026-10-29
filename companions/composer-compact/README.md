# dsh-plugin-composer-compact

DSH **0.2.1-rc.3** 的 Web 客户端插件：把 active 会话底部的 composer 折叠成一条 **52px 单行条**，可随时展开恢复原生布局；默认收起、状态持久化，输入 / Enter / 点击发送 / Shift+Enter / 刷新 / 会话切换均可用。手写、无构建步骤。

**状态**：已在隔离 rc.3 viewer + headless Chrome 中完成 59/59 项端到端检查（2026-10-29，见文末验证索引）。**没有**安装到用户正在使用的桌面 profile，也没有重启桌面实例。

## 1. 行为

| 项 | 实现 |
| --- | --- |
| 默认状态 | collapsed（localStorage 无值时） |
| 持久化 | localStorage 键 dsh.composerCompact，值为 collapsed 或 expanded |
| 生效范围 | 仅 [data-conversation-content][data-content-phase="active"]；hero / 新会话保持原生 |
| 状态标记 | [data-composer-seat] 上的 data-composer-compact-state |
| 收起态 | seat 52px（card 48px）；编辑区 24px 单行、横向裁剪；保留原生发送/停止按钮 + 插件 toggle；隐藏 dock、+、权限 chip、plan、模型选择、附件条 |
| 展开态 | 原生布局（seat 128px；两行草稿 144px）；原生控件矩形与基线一致；toggle 仍在 |
| toggle | 28×28，插在控制行 trailing 组的第一项；内联 SVG chevron；aria-label 展开输入框 / 收起输入框 |
| 焦点 | toggle 的 mousedown 被 preventDefault；收起/展开不丢编辑器焦点 |
| 自动展开 | Shift+Enter、粘贴多行、或编辑区出现第二行 → 切 expanded 并持久化；单行长文本保持收起（不误展开） |
| 健壮性 | apply 全程 try/catch + console.warn；无 seat/card 时安静 no-op；disposer 清理样式、按钮、属性、observer 与监听 |
| 重新挂载 | MutationObserver（rAF 合并；无高频轮询）在 React 重渲染 / 会话切换后幂等重挂 |
| 标记 | html[data-composer-compact="1"]、html[data-composer-compact-version="0.2.0"] |

收起态高度：seat 52px，--dsh-composer-height 由产品自己的 ResizeObserver 跟随变为 52px（实测）。

## 2. 文件

| 文件 | 作用 |
| --- | --- |
| package.json | 包身份、dsh.client.platform=web、exports["./client"] |
| index.mjs | 宿主半锚点（无副作用、无服务、无模型） |
| client.js | 正式客户端半（手写、无 import、无 React、无哈希类名） |
| install-into-profile.mjs | 安装：node_modules + profile patch；备份 + live-desktop 守卫 |
| uninstall-from-profile.mjs | 回退：删 patch insert 块 + 删 copy/junction；保留备份 |
| README.md | 本文件 |

## 3. 安装 / 回退

~~~powershell
# 安装（--profile 必填；不会默认任何 profile）
node install-into-profile.mjs --profile "<profile 目录>"          # 复制安装
node install-into-profile.mjs --profile "<profile 目录>" --link   # junction 到工作树（改源码后刷新生效）
node install-into-profile.mjs --profile "<profile 目录>" --dry-run

# 回退
node uninstall-from-profile.mjs --profile "<profile 目录>"
node uninstall-from-profile.mjs --profile "<profile 目录>" --dry-run
~~~

- 安装做两件事：把包放到 <profile>/node_modules/dsh-plugin-composer-compact；在 <profile>/cordis.patch.yml 追加一个带注释标记的 insert 块。重复运行幂等（already-present）。
- 修改 patch 前会生成 cordis.patch.yml.bak-<UTC> 备份；回退会再备份一次，并且**不删除任何备份**。
- 回退只删除本安装器写的那一块（注释标记 + insert 块）与 node_modules 条目；junction 只 unlink 链接，不会跟随删除工作树。
- 默认拒绝 live desktop profile（<用户目录>/.dsh/profiles/desktop），必须显式 --allow-desktop 才会操作；本仓库从未对真实桌面执行过。
- 两个脚本都不启动、不重启、不杀死宿主进程；安装/回退后需要用户自己重启（或刷新）宿主。

## 4. 装载契约

| 契约点 | 本包做法 |
| --- | --- |
| 浏览器模块 id | window.__ModuleLoader__.load({ id: "dsh-plugin-composer-compact" }) === package.json name |
| 客户端半 | exports["./client"] = "./client.js"（字符串） |
| 平台 | package.json dsh.client.platform = "web" |
| 样式归属 | <style data-plugin="dsh-plugin-composer-compact" data-plugin-css="dsh-plugin-composer-compact/composer-compact.css"> |
| apply 安全 | 整个 apply 包在 try/catch 中；mount 失败也只 console.warn，页面照常 boot |
| 清理 | scope.effect 返回 disposer：断 observer、移除 seat/toggle/样式/html 标记、解绑监听 |

## 5. 选择器策略

- 只用 data-* 属性、结构位置与 aria 属性；**没有任何哈希 CSS Module 类名**，也不依赖本地化文案。
- 关键锚点：data-composer-seat、data-composer-card、data-composer-dock、data-slot="conversation.input.permission|plan|model|attachments"、[contenteditable="true"]。
- 这些都不是 DSH 公开 API；0.2.1-rc.3 实测可用，升级后若锚点变化会安静退化（不折叠、不注入，不影响 boot）。

## 6. 设计说明（与任务 brief 的差异）

1. **toggle 位置**：brief 写「控制行末尾（发送按钮左侧）」。实现把 toggle 插在 trailing 控制组的**第一项**：
   - 收起态：它就是发送按钮左侧（实测 toggle x=1155，send x=1189）；
   - 展开态：它位于模型选择左侧（trailing 组最前），这样 trailing 向左增长，+ / 权限 / 模型 / 发送的矩形与原生基线完全一致（实测四项误差 ≤0.1px）。
   - 若强行插在发送正前方，展开态模型选择会被整体左移约 32px，违反「原生控件矩形逐项恢复」。两种约束冲突时选择了后者。
2. **自动展开判定**：brief 给的是 scrollHeight > clientHeight + 2。实测收起态单行文本的 scrollHeight 已是 28（4px padding + 24px 行盒），而 clientHeight 为 24，直接套用会在**任何输入**时误展开。实现改为：
   - 主判据：编辑器 innerText 在去掉一个行尾换行后仍含换行（Shift+Enter / 粘贴多行）；
   - 兜底：scrollHeight - clientHeight > 半个行高（若 nowrap 规则失效而真的换行，仍能捕获）；
   - 触发面：seat 级 capture 监听（Lexical 会吞掉原生 input 事件）、beforeinput、keydown(Shift+Enter)、编辑区 MutationObserver、compositionend。
3. **收起态附件条隐藏**：card 改成单行布局后附件条会破坏几何，因此收起态隐藏；附件仍属于草稿，展开后可见。真实附件交互未测。

## 7. 已知限制 / 未验证

1. 未安装到用户桌面 profile、未重启桌面实例、未做 CU / 真实桌面视觉验收；结论只覆盖隔离 viewer（DSH 0.2.1-rc.3 / be72761）。
2. 停止按钮、ContextMeter、附件缩略图在该会话没有渲染，未验证；停止/运行中切换未测。
3. 真实 IME composition（候选框定位、组合期间自动展开）未测；代码有 composing 守卫，但只做了 CDP insertText 中文输入。
4. 浅色主题、窄屏/窗口缩放、macOS/Linux、不同 DPI 未测；只在 1440×1000 窗口（1422×848 页面、DPR 1、暗色）验证。
5. HMR 未验证（隔离 viewer 关闭了 hmr 行）；理论上 disposer 与样式归属兼容，但没有实测热更新。
6. 选择器/data-* 不是公开 API，跨版本升级可能失效。
7. 展开态 toggle 位于模型选择左侧（见 §6.1），是几何取舍，不是缺陷；如果更在意视觉位置，可改到最后一项，但原生矩形会移动。
8. 发送测试在隔离 viewer 中会以 NO_ADAPTER 结束（没有模型适配器）；这是环境限制，不是插件错误。未调用任何真实模型。
9. 折叠态隐藏附件条；若先加附件再收起，附件随消息发送但不可见（未做真实附件验证）。
10. 无构建产物、无 TypeScript 类型检查；只有 node --check 与真实浏览器验证。

## 8. 验证索引（隔离环境）

- 运行根：companion verification archive
- 矩阵结果：59/59，0 uncaught，NO_ADAPTER 已记录；截图 15 张；清理与桌面无干扰审计全部通过。
- 证据：final/out/matrix-final/verify.json、final/out/matrix-final/*.png、final/out/final-audit.json、final/REPORT.md。
- 该验证**不是**生产桌面/CU 视觉签收，也**没有**调用真实模型。
