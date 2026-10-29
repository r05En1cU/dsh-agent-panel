# composer compact companion

本仓库的 `companions/composer-compact/` 是既有 **dsh-plugin-composer-compact**（v0.2.0）的原样副本，
用来保留「主输入框折叠成单行条」这个用户要求保留的功能。主包只负责 Agent Team 面板，两者没有运行时依赖。

## 1. 来源与逐字复制

来源：`D:\dsh-plugin-composer-compact`，2026-10-29 复制进本仓库。

| 文件 | 字节 | sha256 | 与源包 |
| --- | --- | --- | --- |
| package.json | 625 | `56f959227cc639e0272cd84d859d583eee9d2e2222437f5ec7cf6df07bb49447` | 字节一致 |
| index.mjs | 921 | `5a95afa32a4f299088ca9d47e6e9fa5afffcd9de7a5696367415dc46e64c8a3a` | 字节一致 |
| client.js | 28117 | `1dde18ed8fa5441bf0be0e148a7e742a76bbcbcc5ac586ebd8e674f18413870f` | 字节一致 |
| README.md | 8343 | `7353bd5e824be3bbd37fb01adc9086c5fe5c174b202ea45b83c35d26b9e172c7` | **1 行不同**（见下） |
| LICENSE | 1085 | `50a44d245051f82d9d3ea06021647aa4ae5700ad46e0f0f8e82dedd7538a8953` | **新增**（见下） |

- 源包没有 LICENSE 文件；这里补了一份与仓库根完全一致的 MIT LICENSE（Copyright (c) 2026 dsh-agent-panel contributors）以便再分发，包内声明仍是 `package.json` 的 MIT。
- **README 的差异**：`README.md` §8 里的机器本地归档路径被改写为 `companion verification archive`（去机器路径）。源码、包名、注册 id、行为、选择器、文案、README 其余内容全部未改。
  源包 README 的 sha256 为 `473c45f3322c0bb8d842d74e28e4e67a4d2adacd13b4d6c6fc93b05d177f1636`（8371 字节）。
- 源包自带的 `install-into-profile.mjs` / `uninstall-from-profile.mjs` **没有复制**：本仓库根目录的安装器负责两个包
  （同样有备份、幂等、live-desktop 守卫），复制一份单包脚本只会让两套逻辑漂移。见 [INSTALL.md](INSTALL.md)。

## 2. 身份不变（装载契约点）

| 契约点 | 值（与源包一致） |
| --- | --- |
| package name | `dsh-plugin-composer-compact` |
| ModuleLoader 注册 id | `dsh-plugin-composer-compact`（必须等于 package.json name） |
| client 导出 | `exports["./client"] = "./client.js"` |
| 平台 | `dsh.client.platform = "web"` |
| 样式归属 | `<style data-plugin="dsh-plugin-composer-compact" data-plugin-css="dsh-plugin-composer-compact/composer-compact.css">` |
| 状态持久化 | `localStorage["dsh.composerCompact"]` |
| 状态标记 | `[data-composer-seat][data-composer-compact-state]` |
| html 标记 | `data-composer-compact="1"` / `data-composer-compact-version="0.2.0"` |

安装器把它当作第二条 Loader row：`node_modules/dsh-plugin-composer-compact` + profile patch 里 `id: composer-compact` 的 insert。

## 3. 行为（保留，未修改）

- 仅对 `[data-conversation-content][data-content-phase="active"]` 生效；hero / 新会话保持原生 composer。
- 默认 collapsed；状态持久化在 `localStorage["dsh.composerCompact"]`，值为 collapsed / expanded。
- 收起态 seat 52px / card 48px：编辑区 24px 单行、横向裁剪；保留原生编辑器、发送/停止按钮与插件 toggle；
  隐藏 dock、附件条、`+`、权限 chip、plan、模型选择。
- 展开态完全回到原生布局；toggle 仍是唯一新增节点（插在 trailing 控制组第一项，保证原生控件矩形不变）。
- Shift+Enter、粘贴多行、或编辑区出现第二行 → 自动展开并持久化；单行长文本不误展开。
- MutationObserver（rAF 合并，无轮询）在 React 重渲染 / 会话切换后幂等重挂；disposer 清理样式、按钮、属性与监听。
- apply 全程 try/catch：任何失败只 console.warn，不阻断 web boot。

细节与已知限制见 package 内 `README.md`（源包原文）。

## 4. 与 panel 的关系

独立插件、独立 package、独立 client module。安装器同时安装两者，但两者没有运行时依赖：
panel 只读原生 `agentTeam` / `goal` 投影并调用原生 Team 路由；composer companion 只操作 composer DOM。
两者互不引用、不共享 store、不互相等待。

## 5. demo harness（渲染主包面板，不是 companion）

`demo/` 是一个零构建静态 harness，用来在没有桌面宿主的情况下渲染真实的主包浏览器半：

```text
demo/index.html   页面外壳：vendor React UMD + #harness-root + 状态条
demo/demo.js      fake __ModuleLoader__ 捕获 -> factory(require) -> apply(ctx) -> 挂载 conversation.view 组件
demo/fixtures.mjs 伪造的原生投影（agentTeam wire view + goal）+ fake sessions service
demo/selfcheck.mjs Node 自检（无浏览器、无依赖）：node demo/selfcheck.mjs
demo/vendor/      React 18.3.1 UMD（react.production.min.js / react-dom.production.min.js）
```

管线（与宿主真实路径一致）：

1. 页面先装假的 `window.__ModuleLoader__`，只记录 `load({ id, factory })`，不实例化；
2. 用真实构建产物 `client.js`（`scripts/build-client.mjs` 生成）注册；捕获 id 必须等于包名 `dsh-plugin-agent-team-panel`；
3. `factory(require)` 用 require shim 提供 `react`（local React UMD），其它模块一律报错而不是静默 undefined；
4. `apply(ctx)` 只拿到三个服务：`sessions`、`slots`、`uiWorkspace`。`slots.inject('conversation.view', …)`
   的记录被 harness 捕获；
5. 按宿主的方式计算 props：`descriptor.inject(sessionId)` 给出 `{ sessionId, sessions, openSession }`，
   harness 再补 `initialState`（`expanded` / `selected` / `modal`），然后 `ReactDOM.createRoot(container).render`。

fake sessions 只实现 client 真实读取的三个点：
`sessions.binding(id).session.getSnapshot()`、`sessions.list.getSnapshot().projectionsBySession[leadId].values`、
以及两个 `subscribe()`。数据全部是伪造的原生 wire view，不含任何其他面板的 store、工具或状态机。

### 运行

```powershell
# 1) 构建浏览器半（首次）
node scripts/build-client.mjs

# 2) 任意静态服务器指向仓库根，打开 demo/index.html
#    也可以用仓库里的截图脚本（自带临时静态服务器 + headless Chrome）
node scripts/shoot.mjs
```

`shoot.mjs` 会把 6 张 1440×940 的静态状态渲染写到 `docs/screenshots/panel-*.png`；`cdp-check.mjs` 另外生成 1 张拖动/实时状态 `panel-dragged-live.png`。

| URL 参数 | 取值 | 作用 |
| --- | --- | --- |
| `state` | `overview` / `bundled` / `expanded` / `new-task` / `spawn` / `member` / `empty` / `failure` | 初始选中、展开、弹窗与投影状态 |
| `client` | 任意 URL | 覆盖 client.js 地址（默认仓库根 `../client.js`） |
| `badge` | `0` | 隐藏底部 harness 状态条 |

状态矩阵：

| state | 数据/初始态 | 截图关注点 |
| --- | --- | --- |
| overview | 5 任务、2 条单边、阶段齐全 | 单边路由、roster、统计 |
| bundled | task-1 有 3 个依赖者 + 1 条单边 | 粗干线 + 同一汇合点的支线 |
| expanded | `initialState.expanded = ["task-2"]` | 节点内展开 |
| new-task | `initialState.modal = { kind: "new-task" }` | 原生 createTask 弹窗 |
| spawn | `initialState.modal = { kind: "spawn" }` | 原生 spawnTeammate 弹窗 |
| member | `initialState.selected = "member:<id>"` | 成员详情 |
| empty | 无 agentTeam 投影 | 空态 |
| failure | 投影 failure 字符串 | 失败横幅 |

自检：`node demo/selfcheck.mjs` → 12/12（wire view 形状、goal 形状、bundled 有 3 个依赖者、
fake sessions 读取点、订阅、loader 捕获、materialize 拒绝未知 require、conversation.view 注册、mount 传参、URL 解析）。

## 6. 截图来源

| 文件 | 内容 | 来源 |
| --- | --- | --- |
| `docs/screenshots/composer-compact-collapsed.png` | 收起态单行条（63059 B，sha256 `57bedcf7c2ba0ca39143447d412d9ce928c346ccf83942f9c7c36dee4c3edaf3`） | 原样复制归档 `01-collapsed.png` |
| `docs/screenshots/composer-compact-expanded.png` | 展开态原生 composer（64012 B，sha256 `6206d0b24ddf0acc86b8863cb4b34dd02cb85b877b4f9fa7dddf88f2d359d60e`） | 原样复制归档 `07-expanded-single-line.png` |
| `docs/screenshots/composer-collapsed.png` | 同一收起态的裁剪图（6931 B，sha256 `fdf39bdfb7273227c026c9b3ac513729857c470d26c4b8c3aa127d0be71cc932`） | 从 `01-collapsed.png` 裁出输入条 |

- 归档：companion 的隔离验证归档（机器本地路径已省略），隔离 DSH 0.2.1-rc.3 viewer + headless Chrome，页面 1422×848，DPR 1，暗色主题，2026-10-29 00:13 UTC 生成。
- **本轮没有重跑这 59 项验证**，只是复制历史截图；它们不是本仓库这一轮运行出来的。
- 内容检查：workspace 名 `composer-verify`、会话标题「未命名」、无本机路径/令牌/个人信息；
  页面里的「本轮运行失败 / no adapter registered for provider "mock"」是隔离环境没有模型适配器的结果（NO_ADAPTER），不是插件缺陷。裁剪版正是为了去掉这行噪声。
- `panel-*.png` 是本轮 `scripts/shoot.mjs` 用 demo harness 真实渲染的（headless Chrome 1440×940），**不是**生产桌面截图。

## 7. 已知限制

- composer companion 的 59/59 端到端结论属于历史归档（隔离 viewer），本轮既未重跑也未安装到真实桌面。
- 选择器策略只依赖 `data-*` / 结构与 aria，不是 DSH 公开 API；宿主升级后可能安静退化为不折叠（不影响 boot）。
- demo harness 只实现 client 真实读取的三个 sessions 读取点与 `slots` / `uiWorkspace`；
  原生 Team 写路由（POST）没有 fake，弹窗只能展示，提交会真的 fetch 到 404。
- demo 页面没有 DSH 的主题变量，面板使用组件自带回退调色板（浅色），与桌面暗色外观不同；
  harness 底部状态条是刻意的「这是 demo」标记，`?badge=0` 可关。
- demo/截图结论只覆盖 Chromium（headless Chrome）1440×940；Firefox/Safari、窄屏、缩放、暗色主题未验。
