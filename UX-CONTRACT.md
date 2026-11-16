# 赛博书房 UI 行为约定

本次记录地球仪范围，不将其他历史界面的差异视为已完成统一。

## 来源

- 产品行为：开发文档/赛博书房地球仪模块设计_v1.0.md。
- 当前存储、迁移和恢复边界：开发文档/地球仪个人足迹闭环_实施与验收_2026-11-14.md；electron/globe/repository.cjs。
- 视觉及运行时 token 所有权：DESIGN.md。

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| 模块容器 | src/features/ui.jsx / FeaturePanel | UX-CONTRACT.md | 沿用返回书房与可滚动正文 | 浏览与整理切换 |
| 3D 直接操作 | GlobeScene + OrbitControls | UX-CONTRACT.md | 拖动、滚轮；等价方向按钮与地点按钮，不依赖拖动 | Three 浏览器测试 |
| 地点选择 | GlobeBrowser | UX-CONTRACT.md | 原生 button 列表；同坐标合并；仅已确认且未删除记录 | geo.test.js |
| 照片详情 | GlobeBrowser 非模态侧栏 | UX-CONTRACT.md | 选中时聚焦卡片，Esc 返回地点；左右键换照片 | Three 浏览器测试 |
| 照片放大 | GlobePanel 照片浏览 dialog | UX-CONTRACT.md | 沿用焦点约束、Esc 与焦点恢复，按当前地点照片序列浏览 | Three 浏览器测试 |
| 搜索 | GlobeBrowser 本地过滤 | UX-CONTRACT.md | 可清空；每批最多 40 地点，可加载更多 | 空结果、清空、键盘 |
| 异步状态 | GlobePanel / GlobeBrowser | UX-CONTRACT.md | 原地 loading、错误、重试，失败仍保留列表浏览 | GPU 丢失与空数据测试 |
| 数据更改 | electron/globe/repository.cjs | UX-CONTRACT.md | 本轮 3D 浏览完全只读，整理沿用既有事务 | repository.test.cjs |

坐标、照片与搜索属于本地私人记忆，不写入 URL。照片整理的查询和草稿由父模块维护，切换浏览前处理未保存编辑。日期编辑沿用平台原生日期输入，本轮不改动日期模型。现有整理流程中的原生确认对话框是历史差异，后续统一到共享应用对话框；本轮新 3D 浏览不引入此类确认或数据写入。

## 模式与恢复

默认打开 3D 浏览；照片整理入口始终可达。确认过的个人地点显示在球面，未知位置、回收站、非法坐标不显示。地点浏览和旋转不修改照片。WebGL 不可用或上下文丢失时提供提示与重试，保留地点列表与照片卡。底图随构建资源打包，无联网请求。连续书房镜头转场、远近区域聚合和旅程播放不属于本轮。

## 离线区域探索（2026-11-15）

GlobeBrowser 的世界地图与我的照片为同级浏览入口。useGeography 管理国家、省区、城市选择；RegionLines 提供轮廓与城市点；所有球面选择都有等价的原生按钮列表。层级导航允许逐级返回。地理搜索只读，不自动写入照片；城市坐标明确标注为定位点。省区按国家异步加载，失败提示并可重试；城市索引随应用离线打包。个人照片卡与全屏查看仍由原有模块管理。

城市按需展示：国家、省区浏览不默认列出或绘制城市；搜索并选中城市后只绘制该城市的临时定位点，导航至其他区域时清除。地名数据继续保留用于查询归属和经纬度。悬停国家、省区时在指针附近显示名称，离开球面、导航或开始拖动时清除提示；提示不拦截鼠标操作。

海外索引层级：GeoNames ADM2 行政单位与参考地点明确分离；列表显示“二级行政区”，详情显示来源上级与定位参考地点。行政代码不能对应当前地图层级时从国家定位，不按多边形猜测父级。未覆盖的查询提供覆盖提示；CN/HK/MO/TW 维持现有数据。本规则由 normalize-world-regions.py 和 verify-world-regions.py 维护。
