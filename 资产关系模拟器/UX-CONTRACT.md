# 模拟器交互约定
业务依据：本对话确认的公共字段、专属字段、上级/下级/关联模型。仅实验数据，不迁移正式项目。
| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | 原生 select | app.js 表单 | 默认 | 浏览器选择 |
| Form | dialogForm 与 field | app.js | 默认 | 创建、编辑、JSON 错误 |
| Scrollbar | :root | style.css | 默认 | 全局 scrollbar-color |
| Toast | notify | app.js | 默认 | role=status |
| CRUD | commit / persist | app.js | 默认 | 撤销及模型测试 |
弹窗使用原生 dialog.showModal，Escape 关闭、背景 inert、浏览器管理焦点。输入框明确 label。本地过滤不持久化 URL。所有删除可以撤销，撤销栈仅本次页面。关闭表单表示放弃本次草稿。
包含允许多上级、禁止循环。关联是对称关系，拒绝反向重复。地点只显示直接关联来源，不复制、不递归推导。删除节点移除其连接，不删除其他节点。类型限制暂不设定，供规则探索。附件仅模拟引用，不提供真实上传。

自由画布：缩放范围 20%–300%，按钮与滚轮为等价入口；节点拖动提供方向键替代。节点坐标与相机状态保存在独立 layout，移动不更新内容 updatedAt。升级移除已识别示例前保留本地备份，用户自建内容不删除。空白状态提供新建引导。

直属关系（direct）：书籍 → 摘录、书籍 → 抄写作品、摘录 → 批注。每个子项最多一个直属上级，允许暂未设置；另可被任意多个集合包含。direct 与 contains 联合检查循环。related 仍双向。既有连接不自动转换；符合类型规则的连接提供“改为直属 / 包含”，保留 ID、说明及顺序，支持撤销。解除直属不删除条目。直属关系归属以 links 为准，历史 data.bookId 等字段暂不自动改写。

当前收紧规则：contains 仅旅途→记忆点、歌单→歌曲。related 禁止同类型、自己、直属/包含保留类型组合及重复连接；其他跨类型允许。关系选择器和保存共用 model.validateLink/eligibleTargets；方向无目标时禁用，目标列表仅合法条目，空状态禁用保存。已有不合法关系保留并标注原因，可在存在合法转换时转换，或解除。此规则覆盖先前允许任意包含及同类型关联的实验阶段规则。自定义类型可跨类型关联，不能直属或包含。
