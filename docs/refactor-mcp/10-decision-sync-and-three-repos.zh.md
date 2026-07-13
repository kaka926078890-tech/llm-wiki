# 决策记录：三仓清单抽取 + sync 挂载

日期：2026-07-10  
状态：**已确认部分**  
关联：[SUMMARY](./SUMMARY.zh.md)

## 已确认

| ID | 决策 | 结论 |
|----|------|------|
| T1 | `catalog:gen` 挂进 `sync:code:full` | **同意**（与 `cbm:sync` 并列） |
| T2 | 覆盖范围 | **middleware + chatkit-web + finclaw 全都做** |

## 仍待确认

| ID | 内容 |
|----|------|
| T3 / 口径 | 见 [11-口径确认清单](./11-scope-rules-checklist.zh.md) —— 你只需按清单勾选/改选项 |

## 含义（工程）

```
npm run sync:code:full
  = sync:code
  + cbm:sync
  + catalog:gen   # 三仓抽取 → feature-lists/*.json
```

实施仍以 E0→E1 验证为准；本决策只定范围与挂载点。
