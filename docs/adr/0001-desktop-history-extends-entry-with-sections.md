# 桌面端历史条目内嵌 sections,不引入批次模型

为承载插件端已验证的历史回看/筛选/导出能力,桌面端在既有 HistoryEntry 上新增可选 `sections: Record<ip, SourceSection[]>`,筛选与导出经 consensusOf 等既有纯函数适配,不搬运插件端 Batch/Row 模型。plugin-store 体积由存档总行数 ≤ 1000 封顶:超额从最老条目整条降级为骨架条目(仅 IP 集合与共识判定),条目总数 200 FIFO 不变。

## Considered Options

- 全盘对齐插件 Batch/Row 形状(字面复用 filterResults/csv,零适配)——被否:连带 cancelled/queriedAt 等后台泵字段,"批次"与桌面单查询前台流的交互模型冲突;两端行为一致性改由 parity 测试用同一 fixtures 钉住。
