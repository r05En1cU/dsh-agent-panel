# 验证记录

日期：2026-10-29 UTC。状态：**源码候选**，未安装到用户桌面、未重启 GUI、未调用真实模型、未 freeze。

## 1. 自动化测试

~~~powershell
node scripts/build-client.mjs
node --test --test-concurrency=1 --test-timeout=30000 "test/*.test.mjs"
node demo/selfcheck.mjs
node scripts/shoot.mjs
node scripts/cdp-check.mjs
~~~

| 项 | 结果 |
|---|---|
| Node tests | **71/71 pass / 0 fail**（335 ms），4 个文件 |
| 其中 host routes | 37/37 |
| 其中 model | 15/15 |
| 其中 geometry | 16/16 |
| 其中 built client | 3/3 |
| demo selfcheck（无浏览器） | **12/12 pass / 0 fail** |
| Chrome CDP 交互 | **5/5** |
| 静态截图 | 6 张（1440×940） |
| CDP 拖动/实时截图 | 1 张（1422×788） |
| 安装/回退（临时 profile） | 两个包 + 两条 patch marker；uninstall 后 node_modules 条目消失、patch 回到 [] |

原始日志：docs/logs/tests.log、docs/logs/demo-selfcheck.log、docs/logs/cdp-check.log、docs/logs/screenshots.log、docs/logs/build.log、docs/logs/install.log、docs/logs/uninstall.log。

## 2. 真实浏览器交互（隔离 demo）

scripts/cdp-check.mjs 用 Chrome DevTools Protocol 在真实 headless Chrome 中：

1. 从构建后的 client.js 挂载 conversation.view 组件；
2. 对 task-2 的 header 派发 mousePressed/Moved/Released，拖动 (142.879, 57.152)；
3. 比较拖动前后的 blockedBy branch path；
4. 用 window.__DEMO__.sessions.update(fixture) 模拟 native projection push，检查标题更新且不刷新页面。

结果（docs/logs/cdp-check.log）：

~~~json
{
  "ok": true,
  "panel mounts": true,
  "drag moves node": { "before": "376px/32px", "after": "518.879px/89.1518px" },
  "blockedBy branch follows drag": {
    "before": ["M 320 181 L 376.5 61", "M 320 181 L 376.5 181", "M 320 181 L 376.5 301"],
    "after":  ["M 319.607 187.653 L 519.375 118.141", "M 320 181 L 376.5 181", "M 320 181 L 376.5 301"]
  },
  "trunk end equals every branch start": { "ok": true, "end": "319.607 187.653", "starts": ["319.607 187.653", "319.607 187.653", "319.607 187.653"] },
  "projection push updates DOM without reload": true
}
~~~

截图：docs/screenshots/panel-dragged-live.png。

## 3. 截图

| 文件 | 内容 | 来源 |
|---|---|---|
| panel-overview.png | 总览、roster、goal、阶段统计 | shoot.mjs |
| panel-bundled.png | 3 个 dependent 的粗 trunk + 细 branches | shoot.mjs |
| panel-expanded.png | task-2 原地展开、线跟随 | shoot.mjs |
| panel-new-task.png | 原生 createTask 表单 | shoot.mjs |
| panel-spawn.png | 原生 spawnTeammate 表单 | shoot.mjs |
| panel-member.png | 成员 inspector / target 绑定 | shoot.mjs |
| panel-dragged-live.png | 拖动 + projection 实时推送 | cdp-check.mjs |
| composer-collapsed.png | composer companion 收起条 | 历史隔离 rc.3 归档裁剪，本轮未重跑 |

demo 截图是真实 Chromium 渲染，但数据是伪造的 native projection；底部状态条标明 “demo harness / fake native projection（非生产 DSH 桌面）”。

## 4. 哈希

| 文件 | sha256 |
|---|---|
| client.js | c5ee6bcdbfe9fe1b1cee8371578e7908920c54547c9b283c8694260640cf9d82 |
| src/model.mjs | a607b1d903bbfdbc9b55078f920478e50c00e67c6389e6db24ba31c0b50e735a |
| src/geometry.mjs | b9f61311a81158c95529a80a16bfb6c2f4ce4493bb987974ca2b3432ddcc83b6 |
| src/client-body.js | 018c65c79f1f16c738581a25149d09e484f6869eae5f94c7534598c4f3cc94c3 |
| src/host-routes.mjs | 504bb611df4f72fb4afbd26c4e2d7264f86291a45b17bb5d89314526ba570bd1 |
| index.mjs | e3906965510d6625e6ee1cb4ab3b531a6f5d6c540eaf066b82d6abfe1be2e76a |
| companions/composer-compact/client.js | 1dde18ed8fa5441bf0be0e148a7e742a76bbcbcc5ac586ebd8e674f18413870f |

## 5. 未验证

- 未安装到真实 desktop profile；未重启宿主；未在真实 DSH 页面中点击。
- 写路由只做了 fake agentTeams/agents 的单元测试；没有在真实 Team 服务上执行 create/update/spawn/send。
- composer companion 的 59 项历史验证未重跑；composer 截图来自历史归档裁剪。
- 暗色主题、窄屏/触控、>100 节点、真实帧率、Safari/Firefox 未验。
- 真实 native projection 与 fake wire view 的字段一致性由 contract/test 保证，但没有跑真实 Team 样本。
