# 口径选择：Codex 5.3 裁决建议

日期：2026-07-10  
模型：[Codex 5.3 评审](02ac8d57-4bdc-443c-a2c6-f42ff564f2ee)（`gpt-5.3-codex`）  
清单原文：[11-scope-rules-checklist](./11-scope-rules-checklist.zh.md)  
状态：**模型建议，待你一句话拍板（采纳 / 修改）**

---

## 汇总一行

```
M1=A M2=A M3=A M4=A M5=A W1=A W2=A W3=A W4=A F1=A F2=A F3=A G1=A G2=A G3=A
```

**结论：全部采用推荐默认包（全 A）。**

---

## 逐题理由（Codex）

| 题号 | 选 | 理由 |
|------|----|------|
| M1 | A | `edition-manifest` 已是 SSOT，最稳 |
| M2 | A | 默认合并全量；问版别再过滤 |
| M3 | A | infra 与微服务分开，避免口径污染 |
| M4 | A | connectors 已在 manifest.services，进主清单 |
| M5 | A | 功能清单默认=服务清单，少扩展、稳 |
| W1 | A | workspaces；apps/libs 分节 |
| W2 | A | 默认管理台页面功能 + 提及其他应用 |
| W3 | A | 排除 login/纯 redirect |
| W4 | A | 固定「非完整商业说明书」声明 |
| F1 | A | crates + CLI 两节 |
| F2 | A | vendor 不进自有模块清单 |
| F3 | A | 说明非微服务并改答模块/CLI |
| G1 | A | public 不露路径 |
| G2 | A | 清单缺失则拒答并提示 sync |
| G3 | A | 禁止表外补充 |

是否只采纳推荐默认包：**是**（与准确/完整/稳定、可自动、对外安全同向）。

---

## Codex 提示的 3 个风险（产品需知）

1. 清单是工程可枚举视角 ≠ 完整商业能力地图。  
2. manifest 与真实部署若不同步，会「稳定地错」——需靠 sync/drift。  
3. 禁表外补充会降低临场发挥——缺项只能先补源再答。

---

## 请你拍板

回复其一即可：

- **`采纳 Codex 全 A`** → 写入正式 decision，进入 Phase 0/1  
- **`采纳，但改：…`**（列出要改的题号）  
- **`不采纳，重新议：…`**
