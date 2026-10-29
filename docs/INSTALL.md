# dsh-agent-panel · 安装 / 刷新 / 回退

目标宿主：DSH **0.2.1-rc.3** 的 Web profile。两个包一起安装：

| 角色 | 包名 | 源码目录 | 装载行 id | node_modules 目标 |
| --- | --- | --- | --- | --- |
| 主包 | `dsh-plugin-agent-team-panel` | 仓库根 | `agent-team-panel` | <profile>/node_modules/dsh-plugin-agent-team-panel |
| companion | `dsh-plugin-composer-compact` | `companions/composer-compact` | `composer-compact` | <profile>/node_modules/dsh-plugin-composer-compact |

两行互相独立：主包提供 Host exact routes + 浏览器 `conversation.view` 面板，companion 只折叠 active 会话的 composer。
companion 的包名、client 注册 id 与行为保持源包不变，见 [COMPOSER.md](COMPOSER.md)。

## 1. 前置条件

1. **Node.js ≥ 20.11**（安装器用 `import.meta.dirname`）；本仓库实测于 Node v24.14.1。
2. **profile 目录已存在**。安装器不创建 profile、不猜默认 profile；没有 `--profile` 直接报错。
3. **先构建浏览器半**（主包需要）：

```powershell
cd dsh-agent-panel
node scripts/build-client.mjs      # 或 npm run build
```

   产物是仓库根 `client.js`（由 `src/model.mjs`、`src/geometry.mjs`、`src/client-body.js` 拼成）。
   缺失时安装仍会完成，但结果 degraded：警告 + 退出码 3。
4. 不需要联网、不需要安装依赖：两个包都没有 dependencies。

## 2. 命令

```powershell
# 只看计划，不写任何文件（推荐先跑）
node install-into-profile.mjs --profile "<profile 目录>" --dry-run

# 安装（复制）
node install-into-profile.mjs --profile "<profile 目录>"

# 安装（junction 到工作树：改源码后刷新页面即可）
node install-into-profile.mjs --profile "<profile 目录>" --link

# 回退
node uninstall-from-profile.mjs --profile "<profile 目录>"
node uninstall-from-profile.mjs --profile "<profile 目录>" --dry-run
```

| 参数 | 作用 |
| --- | --- |
| `--profile <dir>` | 必填；profile 目录 |
| `--patch <file>` | 覆盖 profile patch 路径（默认 <profile>/cordis.patch.yml） |
| `--link` | 两个包都用 junction 指向工作树（默认复制） |
| `--dry-run` | 只打印计划；不建目录、不复制、不写 patch、不备份 |
| `--force` | 允许替换 package.json 名字不符的 node_modules 条目（默认拒绝） |
| `--require-complete` | 有缺失构建产物时以退出码 2 失败（默认 3） |
| `--allow-desktop` | 显式解除 live desktop 保护（本仓库从未使用） |

## 3. 安装器做什么

1. 校验两个 `package.json`：`name`、`dsh.client.platform === "web"`、`exports["./client"]` 是字符串且指向存在的文件。
2. 计算载荷：`package.json` 的 `files[]`（npm 语义；忽略 `node_modules`、`.git`、`.bak-*`），并算逐文件 sha256 摘要。
3. 在 `<profile>/node_modules/<包名>` 放复制目录或 junction：
   - 不存在 → `installed` / `linked`
   - 已存在且摘要一致 → `up-to-date`（不重写）
   - 已存在但内容变化 → `refreshed`
   - 是 junction 且指向同一工作树 → `up-to-date`（不重建）
   - 名字不符 → 报错退出（除非 `--force`）
4. 向 profile patch 追加两条 insert 项；**写之前只备份一次** `cordis.patch.yml.bak-<UTC>`。
5. 打印 JSON（packages / patch / steps / warnings），并提示宿主需要用户自己刷新或重启。

追加的两块（profile patch 顶层是 YAML 数组，多个 `insert:` 项合法）：

```yaml
# dsh-agent-panel install: dsh-plugin-agent-team-panel (install-into-profile.mjs)
- insert:
    - id: agent-team-panel
      name: "dsh-plugin-agent-team-panel"

# dsh-agent-panel install: dsh-plugin-composer-compact (install-into-profile.mjs)
- insert:
    - id: composer-compact
      name: "dsh-plugin-composer-compact"
```

`name` 写包名而不是 `file:` URL：web 插件表把它解析到 <profile>/node_modules/<包名>，读 `dsh.client`，
再把 `exports["./client"]` 作为 `/plugins/<包名>/client.js` 提供给浏览器。

## 4. 退出码与 degraded

| 退出码 | 含义 |
| --- | --- |
| 0 | 安装完成（或 dry-run 计划完整） |
| 2 | 拒绝或失败：缺 `--profile`、profile 不存在、live desktop 未加 `--allow-desktop`、清单非法、node_modules 名字不符、带 `--require-complete` 且缺构建产物 |
| 3 | 安装完成但 degraded：主包缺 `client.js`（或 `main`）——先构建再重跑 |

## 5. 幂等

- 第二次运行：两个包 `up-to-date`，patch `appended: 0 / alreadyPresent: 2`，不产生新备份，patch 字节不变。
- 幂等来自内容摘要（载荷逐文件 sha256），不是时间戳；源码没变就不重写。
- patch 里已有同一条块 → 不重复追加；同一包名以其它形状出现 → 只警告、不追加（避免重复装载行）。

## 6. 刷新

| 安装方式 | 源码改动后怎样生效 |
| --- | --- |
| 复制（默认） | 重跑安装器：摘要变化 → `refreshed`；然后宿主刷新/重启 |
| junction（`--link`） | 无需重装；宿主刷新页面或重载插件即指向新源码 |
| 只改了构建产物 client.js | 复制模式重跑安装器；junction 模式直接刷新 |

安装器**不**启动、不重启、不杀死宿主进程，也不清浏览器缓存。

## 7. 回退

```powershell
node uninstall-from-profile.mjs --profile "<profile 目录>" --dry-run
node uninstall-from-profile.mjs --profile "<profile 目录>"
```

- 只删本仓库写的两条块：先按字节精确匹配，再按注释行 + insert 缩进块匹配；块里必须出现该包名才删。
- node_modules 条目只在 `package.json` 名字匹配时删除；junction 只 unlink，不跟随删除工作树。
- 删除前再备份一次 patch；所有 `.bak-*` 永不删除，输出里的 `keptBackups` 会列出来。
- 若 patch 里还有以其它形状出现的包名，会报告并保留（需人工确认）。

## 8. 宿主与 live desktop 保护

- 两个脚本都不启动/重启/杀死宿主；装完请自己刷新页面或重启 DSH。
- 默认拒绝 live desktop：目标等于 `<用户目录>/.dsh/profiles/desktop`，或目录名就是 `desktop`，都直接退出码 2；
  只有显式 `--allow-desktop` 才会操作。**本仓库从未对真实桌面执行过安装或回退。**

## 9. 装完怎么自查

1. 两个目录存在且名字正确：
   `<profile>/node_modules/dsh-plugin-agent-team-panel/package.json`、
   `<profile>/node_modules/dsh-plugin-composer-compact/package.json`。
2. profile patch 里两条 insert 都在，且没有重复的 id；两个 `# dsh-agent-panel install: …` 注释块各一份。
3. 两个包的 `client.js` 都在已安装目录里。
4. 重启宿主后：
   - 浏览器请求 `/plugins/dsh-plugin-agent-team-panel/client.js` 与 `/plugins/dsh-plugin-composer-compact/client.js` 返回 200；
   - 会话里出现「Agent Team」页签；active 会话的 composer 收起成一条；
   - 宿主日志能看到 `agent-team-panel` 注册 owner routes（connection 可用时）。
5. 面板数据只来自原生 `agentTeam` / `goal` 投影；面板不落库、不写 team/* 事件。
   写操作需要 `ctx.agentTeams` 与 `ctx.agents`：Team 未启用时面板显示空态，写操作会失败。

## 10. 故障排查

| 现象 | 处理 |
| --- | --- |
| `--profile is required` | 必须显式给 profile；本仓库故意没有默认 profile |
| `profile directory does not exist` | 先让宿主生成 profile，或手工建目录 |
| `refusing to install into the live desktop profile` | 确认目标不是桌面 profile；确需操作才加 `--allow-desktop` |
| 退出码 3 / `degraded: true` | 先构建 client.js，再重跑安装器 |
| `refusing to replace ... contains package "x"` | 目录属于别的包；确认后用 `--force` 或手工清理 |
| 重启后没有新页签 | 检查 patch 是否在宿主实际使用的 profile、宿主是否真的重启、浏览器是否缓存 |
| patch 里有 `name:` 但不生效 | 装载行 id 必须唯一；用 `--dry-run` 看 `presentOtherShape` 警告 |
| 宿主升级后装载异常 | Loader/patch 结构可能变化；先跑 `--dry-run` 看计划再动手 |

## 11. 本轮实测范围

实测（临时 profile，未启动宿主）：

- `--dry-run`：两个包均 `would-installed`，计划 2 条块 / 324 字节，dry-run 后 patch 字节不变。
- 复制安装两次：第一次 `installed` + 一次备份；第二次两个包 `up-to-date`、`appended: 0`、patch 字节与 mtime 均不变。
- junction 安装两次：`linked` → `up-to-date`（不重建）；回退后工作树完整。
- 回退：patch 恢复到安装前字节完全一致，两个 node_modules 条目删除，备份保留。
- live desktop 守卫退出码 2（未写任何文件）；名字不符守卫退出码 2；`--require-complete` 退出码 2。

未实测：

- 真实 desktop profile 的安装/回退，以及重启后宿主的实际装载。
- 宿主内两个插件共存、页签真实切换、浏览器缓存行为。
- 非 Windows 平台的 junction 语义（Windows 用 junction，其它平台是 symlink）。
