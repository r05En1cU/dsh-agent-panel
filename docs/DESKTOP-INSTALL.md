# Desktop profile 安装记录

日期：2026-10-29 13:10 UTC。目标 profile：

~~~text
C:\Users\Rosen Luo\.dsh\profiles\desktop
~~~

**当前宿主进程仍是安装前的模块；本记录只证明磁盘上的 profile 已就绪，重启后生效。**
没有在本轮重启 DSH（当前对话运行在该宿主内）。

## 1. 安装前

| 项 | 值 |
|---|---|
| cordis.patch.yml | 8101 B，sha256 7FCBB18141761A7E7F4B00F8E73704357DFE04DC4FC8F55DFDA7D601AFD53EB0 |
| 手工备份 | cordis.patch.yml.pre-agent-panel-20261029-131016 |
| 已有 PAT 受管区块 | 是（file:///D:/PAT 的 host/preset/view-client 行，以及 tool-agent-team/goal-round-driver 的 disable） |
| 已有 composer | dsh-plugin-composer-compact junction -> D:\dsh-plugin-composer-compact |

## 2. 执行

1. 使用本仓库安装器把 panel 复制进 profile，并把 composer companion 从旧 junction 刷新为仓库副本：

   ~~~powershell
   node install-into-profile.mjs --profile "C:\Users\Rosen Luo\.dsh\profiles\desktop" --allow-desktop
   ~~~

   - panel：node_modules/dsh-plugin-agent-team-panel（copy）
   - composer：node_modules/dsh-plugin-composer-compact（copy，替换旧 junction）
   - patch 追加一条 agent-team-panel insert；composer 原有行保留
   - 安装器备份：cordis.patch.yml.bak-2026-10-29T13-10-19-529Z

2. 使用 PAT 自带卸载移除受管区块：

   ~~~powershell
   cd D:\PAT
   node implementation/plugin/install.mjs --profile desktop --remove
   ~~~

   - 备份：cordis.patch.yml.pat-backup-1793279423631
   - D:\PAT 源码、run/evidence 数据未删除

3. 手工修正 preset 默认值：

   ~~~yaml
   - id: agent-preset-registry
     config:
       default: standard
       selectedDefault: standard
   ~~~

   PAT preset 已移除；原 selectedDefault=pat 会指向不存在的 preset。

## 3. 安装后（磁盘）

| 项 | 值 |
|---|---|
| cordis.patch.yml | 106 行，sha256 303C8DD19C3FAC56DE33097EF978177258F6FF687608CB8DF452318C9BC60835 |
| PAT 行/区块 | 已移除（patch 中无 PAT/preset-pat/pat-view-client） |
| 原生 Team 工具/Goal 覆盖 | PAT 的 disable 已随区块移除，原生 rows 恢复 |
| selectedDefault | standard |
| panel client.js | 90386 B，sha256 C5EE6BCDBFE9FE1B1CEE8371578E7908920C54547C9B283C8694260640CF9D82 |
| composer client.js | 28117 B，sha256 1DDE18ED8FA5441BF0BE0E148A7E742A76BBCBCC5AC586EBD8E674F18413870F |
| panel package | node_modules/dsh-plugin-agent-team-panel（copy） |
| composer package | node_modules/dsh-plugin-composer-compact（copy） |

## 4. 重启后检查

1. 模式列表不再有「PAT · 拍拍」，默认 standard；
2. 会话 View tabs 出现 **Agent Team**；打开后应显示原生 agentTeam projection（无 Team 记录时为明确空态）；
3. 原生 Agent Team header 面板/工具恢复，PAT 的 disable 不再存在；
4. composer 仍可折叠为单行条；
5. 若面板空白，检查宿主日志中的 agent-team-panel owner routes 与 agentTeam 投影，而不是回退到旧 PAT 行。

## 5. 回退

~~~powershell
# 恢复到安装前（包含 PAT 区块、composer junction、旧 selectedDefault）
Copy-Item "C:\Users\Rosen Luo\.dsh\profiles\desktop\cordis.patch.yml.pre-agent-panel-20261029-131016" "C:\Users\Rosen Luo\.dsh\profiles\desktop\cordis.patch.yml" -Force
# 删除两个 copy；如需恢复 composer 旧 junction，可重新指向 D:\dsh-plugin-composer-compact
Remove-Item "C:\Users\Rosen Luo\.dsh\profiles\desktop\node_modules\dsh-plugin-agent-team-panel" -Recurse -Force
Remove-Item "C:\Users\Rosen Luo\.dsh\profiles\desktop\node_modules\dsh-plugin-composer-compact" -Recurse -Force
~~~

无 Team 数据迁移；D:\PAT 的数据不被本安装/卸载触碰。
