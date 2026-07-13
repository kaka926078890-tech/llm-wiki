# 功能清单到底怎么生成（逐步说明）

日期：2026-07-10  
状态：方法说明（回答「依旧没有说明生成方式」）  
关联：[07 三仓不对称](./07-asymmetric-repos-no-universal-manifest.zh.md)

---

## 0. 先定义：这里的「功能清单」指什么

**功能清单 = 一组「功能条目」的列表。**  
每一条至少包含：

| 字段 | 含义 | 例子 |
|------|------|------|
| `id` | 稳定标识 | `admin.channels` |
| `title` | 给人看的短名 | 通道配置 |
| `summary` | 一句话（可空） | 配置飞书/钉钉连接 |
| `source` | 从哪抽出来的 | `route:/admin/channels` + `i18n:channels` |
| `confidence` | 高/中/低 | 路由+文案都有 → 高 |

**生成方式 = 用固定规则从代码/声明文件抽出这些条目，写成一份 JSON。**  
不是让大模型「想一遍功能」。

文档不全时：`summary` 可以空或很短，但 **`id/title/source` 仍可从结构生成**。

---

## 1. 总流程（所有仓共用这 4 步）

```
① 选抽取器（按仓库）
② 跑抽取器 → 得到原始条目（带 source）
③ 合并去重 + 打置信度
④ 写出 feature-list.json（问答时只读这份）
```

问答时：

```
用户问「功能清单」
  → 读对应仓的 feature-list.json
  → 按 debug/public 渲染
  → 禁止模型再发明条目
```

下面按仓写清 **① 用什么抽取器、输入是什么、输出长什么样**。

---

## 2. chatkit-middleware：功能清单怎么生成

middleware 的「功能」在工程上主要体现为 **可部署服务 + 流程能力**。

### 抽取器 M1：服务能力（主）

| 项 | 内容 |
|----|------|
| **输入** | `edition-manifest.yaml` |
| **规则** | 读取 `editions.basic.services` + `editions.advance.services`，按 `name` 去重 |
| **每条输出** | `id=service:{name}`，`title=name`，`source=edition-manifest`，可选读该 `path/README.md` 第一句作 `summary` |
| **不包含** | `infrastructure`（postgres 等）——单独清单或标注「基础设施」 |

**伪代码：**

```text
for svc in manifest.editions.*.services:
  emit Feature(id="service:"+svc.name, title=svc.name, path=svc.path, source="edition-manifest")
  summary = first_paragraph(svc.path + "/README.md") or ""
```

### 抽取器 M2：流程能力（辅）

| 项 | 内容 |
|----|------|
| **输入** | `flows/*.yaml`（如 inbound / outbound） |
| **规则** | 每个 flow 文件 → 一条「流程能力」 |
| **输出** | `id=flow:inbound`，`title=入站流程`，`source=flows/inbound.yaml` |

### 抽取器 M3：API 能力（辅，文档差也能用）

| 项 | 内容 |
|----|------|
| **输入** | `contracts/**/*.yaml`（OpenAPI） |
| **规则** | 每个 tag 或每个 path 摘要成能力点（可先按 tag 聚合，避免太碎） |
| **输出** | `id=api:{tag}`，`title=tag 名`，`source=contracts/...` |

### middleware 合并结果示例（示意）

```json
{
  "repo": "chatkit-middleware",
  "list_type": "feature",
  "items": [
    {
      "id": "service:identity-service",
      "title": "identity-service",
      "summary": "认证与 JWT（来自 README 首段，可空）",
      "source": ["edition-manifest.yaml"],
      "confidence": "high"
    },
    {
      "id": "flow:inbound",
      "title": "入站流程 Flow A",
      "summary": "",
      "source": ["flows/inbound.yaml"],
      "confidence": "high"
    }
  ]
}
```

**生成命令形态（未来）：** `npm run catalog:gen -- middleware`  
**维护：** manifest/flows/contracts 变更 → 重跑；diff 出新增/删除条目。

---

## 3. chatkit-web：功能清单怎么生成（无微服务表时）

web 没有服务 manifest。功能入口主要在 **应用包 + 路由 + 界面文案**。

### 抽取器 W1：应用/模块清单

| 项 | 内容 |
|----|------|
| **输入** | 根 `package.json` → `workspaces` |
| **规则** | 每个 workspace 一条；`libs/*` 标 kind=library，应用标 kind=app |
| **输出** | `id=app:chatkit-admin-mt`，`title=chatkit-admin-mt`，`source=package.json#workspaces` |

这是「有哪些前端应用」，常作为功能清单的 **第一层**。

### 抽取器 W2：页面功能（管理台 / 用户端）——功能清单主路径

| 项 | 内容 |
|----|------|
| **输入** | 各 SPA 的路由定义（如 `chatkit-admin-mt/src/App.tsx` 里的 `<Route path=...>`） |
| **规则** | 每个业务 path（过滤 `/login` 等）→ 一条功能 |
| **title 怎么来** | 优先用 `locales/zh.json` 里对应导航文案（如 `layout.*`、`channels`、`llmConfig`）；没有文案就用 path 最后一段 |
| **summary** | 有页面 README/注释则抽；否则空 |

**伪代码：**

```text
routes = parse_react_routes("chatkit-admin-mt/src/App.tsx")
i18n = load("src/locales/zh.json")
for r in routes where not auth_only(r):
  title = i18n_nav_label(r) or humanize(r.path)
  emit Feature(id="route:admin:"+r.path, title=title, source=["App.tsx", "zh.json"])
```

**用现仓可抽到的信号举例（管理台 i18n 顶层已有）：**  
`channels`、`llmConfig`、`domainAllowlist`、`skillCatalog`、`members`、`roles`、`tenants`、`mcpTools`、`tokenUsage`…  
这些 **不依赖齐全的产品文档**，依赖 UI 已经写进界面的键名。

### 抽取器 W3：集成点（专项）

| 项 | 内容 |
|----|------|
| **输入** | 代码里 IM/connector 相关常量或配置 UI |
| **输出** | `飞书` / `钉钉` / `企微` 等条目（你们 golden 已在测这类） |

### web 合并结果示例（示意）

```json
{
  "repo": "chatkit-web",
  "list_type": "feature",
  "items": [
    {
      "id": "app:chatkit-admin-mt",
      "title": "管理后台",
      "summary": "多租户管理控制台",
      "source": ["package.json#workspaces"],
      "confidence": "high"
    },
    {
      "id": "route:admin:/admin/channels",
      "title": "通道配置",
      "summary": "",
      "source": ["App.tsx", "locales/zh.json#channels"],
      "confidence": "high"
    },
    {
      "id": "route:admin:/admin/llm",
      "title": "LLM 配置",
      "summary": "",
      "source": ["App.tsx", "locales/zh.json#llmConfig"],
      "confidence": "high"
    }
  ]
}
```

**这就是 web「功能清单」的生成方式：路由枚举 + 中文文案键，不是写产品说明书。**

---

## 4. finclaw：功能清单怎么生成

finclaw 是 Rust 工作区，不是微服务群。

### 抽取器 F1：模块清单

| 项 | 内容 |
|----|------|
| **输入** | 根 `Cargo.toml` workspace members / `crates/*` |
| **输出** | `id=crate:agent-loop`，`title=agent-loop`，`source=Cargo.toml` |

### 抽取器 F2：CLI 功能（用户可感知）

| 项 | 内容 |
|----|------|
| **输入** | `hosts/cli` 里 clap 定义（`args.rs` / `main.rs`） |
| **规则** | 每个 subcommand → 一条功能 |
| **title** | clap 的 about/help；可有中文 catalog |

### 抽取器 F3：运行时能力面（辅）

| 项 | 内容 |
|----|------|
| **输入** | HTTP 路由 / contract OpenAPI / skills 机制文档路径 |
| **输出** | 按路由前缀或 tag 聚合的能力条目 |

### finclaw 示例（示意）

```json
{
  "repo": "finclaw",
  "list_type": "feature",
  "items": [
    { "id": "crate:claw", "title": "claw", "source": ["crates/claw"], "confidence": "high" },
    { "id": "cli:configure-llm", "title": "配置 LLM", "source": ["hosts/cli/..."], "confidence": "high" }
  ]
}
```

---

## 5. 文档不全时，生成结果长什么样（诚实）

同一套生成器，文档差只影响 `summary`，不影响「有哪些条目」：

| 情况 | 生成结果 |
|------|----------|
| 有路由 + 有 i18n | title 完整，confidence=high |
| 有路由、无文案、无 README | title=路径名，summary=""，confidence=medium |
| 只有 crate 名 | title=crate 名，标明「模块清单，非产品说明书」 |
| 用户要「完整商业功能册」但无文案源 | 返回已生成的结构功能清单 + 明确一句：**「产品说明文档不足，以下为工程可枚举功能入口，可能不是完整业务功能册」** |

**禁止：** 模型补全「大概还有…」或「共 10 大功能」却无 source。

---

## 6. 和问答的衔接（生成之后怎么用）

```
离线/同步时：
  catalog:gen → .reasonix/feature-lists/{repo}.json

在线问「xx 功能清单」：
  1. 识别 repo + 意图=feature_list
  2. 加载该 JSON
  3. 渲染列表（public：title+summary；debug：+source）
  4. Completeness = 输出条目集合是否等于 JSON 条目集合
```

**生成在同步阶段完成；回答阶段不生成名单。**

---

## 7. 一句话对照（你要的「生成方式」）

| 仓 | 功能清单生成方式 |
|----|------------------|
| middleware | **解析 edition-manifest（服务）+ flows +（可选）OpenAPI tags** → JSON |
| web | **解析 workspaces + React 路由 + zh.json 导航文案** → JSON |
| finclaw | **解析 Cargo crates + CLI subcommands +（可选）HTTP/contract** → JSON |

共同点：都是 **确定性抽取脚本**，不是「AI 读一遍仓库写功能」。  
AI 最多：在已有 README 段落上润色 `summary`，且必须带 source。

---

## 8. 下一问

是否确认：**功能清单 = 按上表抽取器生成的 JSON 条目列表**；  
并选定第一期先做哪一个仓的生成器？

建议第一期：**web 的 W1+W2（workspaces+路由+i18n）** 或 **middleware 的 M1（manifest）**——两者都不依赖齐全产品文档。请选一个先做验证。
