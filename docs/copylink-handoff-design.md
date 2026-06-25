# CopyLink 交接设计文档

## 1. 背景

当前项目要解决的问题是：我们有一批医学影像报告 link，每个 link 打开后先进入报告界面，再通过页面上的 `查看影像` / `View Image` 按钮进入影像 viewer。部分 link 有有效期，过期后无法继续访问真实系统。

GUIAgent 的训练目标不是理解真实医学影像内容，而是学习操作流程，例如：

- 从报告页进入影像页。
- 调整窗宽窗位。
- 切换布局。
- 打开序列列表并选择指定序列。
- 查看 DICOM 信息。
- 关闭弹窗并回到 viewer。

因此，复刻目标不是把原始医院系统完整搬下来，而是在 link 过期前快速生成一个本地可点击的操作仿真页面。

## 2. 为什么不直接复制原站源码

直接复制原站 HTML、CSS、JS、接口看起来最接近原始系统，但实际风险很高：

- 原站通常依赖后端接口、临时 token、路由参数、viewer 服务和鉴权状态。
- 影像 viewer 很可能由 canvas/WebGL/私有库渲染，离线复制后 JS 很容易失效。
- 多厂商系统的 DOM 结构差异大，强行做通用源码克隆会非常脆弱。
- 完整复制接口和真实 viewer 会引入更多医学隐私和授权风险。
- GUIAgent 当前只需要学习操作流程，不需要真实 DICOM 像素级渲染。

所以项目采用更稳定的策略：

```text
原始视觉布局 = 截图
可操作区域 = 透明热区
交互结果 = 状态机
```

这让系统可以快速冻结即将过期的 link，同时保证交互行为可控、可测试、可扩展。

## 3. 核心设计

CopyLink 的核心模型是“截图 + 热区 + 状态机”。

一个 case 目录代表一个被复刻的 link：

```text
cases/<case-id>/
  manifest.json
  actions.json
  report.png
  viewer.png
  viewer_layout_menu.png
  viewer_series_menu.png
  viewer_dicom_info.png
  index.html
  style.css
  runtime.js
  case-data.js
```

### 3.1 截图负责视觉保真

`report.png` 保存报告页视觉，`viewer.png` 保存影像页视觉。

弹窗、菜单、列表也作为独立截图状态保存，例如：

- `viewer_layout_menu.png`：点击布局按钮后的菜单。
- `viewer_series_menu.png`：点击序列栏后的序列列表。
- `viewer_dicom_info.png`：点击 DICOM 信息后的弹窗。

这样可以最大程度保留不同厂商的页面布局差异。

### 3.2 热区负责可点击位置

`actions.json` 记录每个可操作区域：

```json
{
  "id": "open_viewer_1",
  "page": "report",
  "action": "open_viewer",
  "text": "查看影像",
  "box": { "x": 1194, "y": 0, "width": 86, "height": 54 },
  "targetPage": "viewer"
}
```

含义：

- `page`：这个热区在哪个截图状态上。
- `action`：语义动作。
- `box`：相对截图左上角的坐标和尺寸。
- `targetPage`：点击后跳转到哪个截图状态。
- `value`：某些动作的结果值，例如 `set_layout` 的 `2x2`，或 `select_series` 的序列 ID。

### 3.3 状态机负责交互变化

runtime 根据当前 `page` 渲染对应截图，并覆盖透明热区。

点击热区后：

- 如果有 `targetPage`，切换到对应截图状态。
- 如果是 `set_layout`，记录当前布局值。
- 如果是 `select_series`，记录选中的序列值。
- 如果是 `show_dicom_info` 且有 `targetPage`，展示 DICOM 弹窗截图状态。

## 4. 模块边界

项目代码分为五块。

### 4.1 CLI

入口文件：

```text
bin/copylink.js
src/cli.js
```

负责解析命令并调用对应模块。

支持命令：

```bash
node bin/copylink.js capture <url> [--viewer-wait-ms <ms>]
node bin/copylink.js record-states <case-dir> <url>
node bin/copylink.js record-actions <case-dir> <url> --page <page-id>
node bin/copylink.js record-flow <case-dir> <url> --page <page-id>
node bin/copylink.js add-page <case-dir> <page-id> <screenshot>
node bin/copylink.js add-action <case-dir> <page> <action> --box <x,y,w,h>
node bin/copylink.js build <case-dir>
node bin/copylink.js serve <case-dir>
```

### 4.2 Recorder

代码位置：

```text
src/recorder/capture.js
src/recorder/recordStates.js
src/recorder/recordActions.js
src/recorder/profiles/zscloud.js
```

职责：

- 用 Playwright 打开真实 link。
- 截取报告页和影像页。
- 自动识别 `zscloud` 的 `查看影像` 入口。
- `capture` 不注入任何采集面板；截图前会清理旧的 CopyLink 浮层，避免把 recorder 拍进基础 case。
- `record-states` / `record-actions` 才注入快捷键和页面内浮层，辅助采集额外状态和热区。

`record-states` 用于快速采集弹窗/菜单截图：

- `Ctrl/Cmd+Shift+S`：打开页面内输入浮层，输入 page id 后自动截图并注册到 `manifest.json`。
- `Ctrl/Cmd+Shift+Q`：结束录制。

`record-actions` 用于从真实点击自动生成热区，并尽量让采集员按真实流程点一遍即可：

- 页面右侧会出现 `CopyLink recorder` 常驻面板。
- 先用面板按钮或数字快捷键选择动作模式，再点击真实控件。
- 工具自动读取更合适的可点击元素 bounding box 和文字。
- 打开菜单/弹窗类动作会在点击后自动截图并注册对应 `targetPage`。
- 对于 `select_series`，工具会用被点击序列文字生成稳定值。
- 遇到特殊动作时可以切到 `0 - Manual CSV`，保留旧的 `action,targetPage,value,page` 输入方式。

`record-flow` 用于把一次真实操作过程录成线性截图轨迹：

- 每个 link 都保存自己的 `flow.json` 和 `flow_000.png`、`flow_001.png` 等截图。
- 每次真实点击会记录点击坐标，并在点击后保存下一张截图。
- 离线页面按录制顺序回放：显示当前截图，只开放下一次点击的透明热区，点击后进入下一张截图。
- 这个模式不依赖 viewer DOM 细节，适合多个 link 的界面细节不同但操作流程大致相同的场景。

### 4.3 Actions

代码位置：

```text
src/actions/addPage.js
src/actions/addAction.js
```

职责：

- `addPage`：向 `manifest.json` 注册新的截图状态。
- `addAction`：向 `actions.json` 追加新的透明热区。

### 4.4 Builder

代码位置：

```text
src/builder/buildCase.js
runtime/index.html
runtime/style.css
runtime/runtime.js
```

职责：

- 复制 runtime 静态文件到 case 目录。
- 生成 `case-data.js`。
- 过滤敏感原始 URL，避免把患者号、检查号、studyUid、完整 viewer URL 写入离线运行数据。

### 4.5 Runtime

代码位置：

```text
runtime/runtime.js
```

职责：

- 加载 `window.COPYLINK_CASE`。
- 显示当前截图。
- 渲染当前 page 的透明热区。
- 根据 action 更新状态或切换 page。

runtime 不访问真实后端，不加载真实 DICOM，不调用原站接口。

## 5. 推荐完整采集流程

以 `zscloud` link 为例。

### 5.1 基础采集

```bash
node bin/copylink.js capture "https://zscloud.zs-hospital.sh.cn/film/#/shared?code=xg06q2" --viewer-wait-ms 8000
```

生成：

```text
cases/zscloud_xg06q2/report.png
cases/zscloud_xg06q2/viewer.png
cases/zscloud_xg06q2/manifest.json
cases/zscloud_xg06q2/actions.json
```

`--viewer-wait-ms` 用于影像页跳转后的额外稳定等待。默认会等一小段；如果影像页加载慢、截图还是太早，可以把它调到 `8000` 或 `12000`。

### 5.2 采集弹窗和菜单状态

```bash
node bin/copylink.js record-states cases/zscloud_xg06q2 "https://zscloud.zs-hospital.sh.cn/film/#/shared?code=xg06q2"
```

在浏览器中：

1. 手动从报告页点击 `查看影像` 进入 viewer。
2. 点击布局按钮，让布局菜单出现。
3. 按 `Ctrl/Cmd+Shift+S`，输入 `viewer_layout_menu`。
4. 点击序列栏，让序列列表出现。
5. 按 `Ctrl/Cmd+Shift+S`，输入 `viewer_series_menu`。
6. 点击 DICOM 信息，让弹窗出现。
7. 按 `Ctrl/Cmd+Shift+S`，输入 `viewer_dicom_info`。
8. 按 `Ctrl/Cmd+Shift+Q` 结束。

### 5.3 采集真实按钮热区

如果主要目标是复现一次完整点击过程，优先使用 `record-flow`：

```bash
node bin/copylink.js record-flow cases/zscloud_xg06q2 "https://zscloud.zs-hospital.sh.cn/film/#/shared?code=xg06q2" --page report
```

在浏览器中按真实路径操作一遍，结束时按 `q`。工具会生成 `flow.json` 和一组 `flow_*.png`。多个 link 可以共用同一套录制方式，但每个 case 保留自己的截图和点击坐标。

如果还需要语义化热区，再使用 `record-actions` 精修：

```bash
node bin/copylink.js record-actions cases/zscloud_xg06q2 "https://zscloud.zs-hospital.sh.cn/film/#/shared?code=xg06q2" --page viewer
```

页面右侧会出现录制面板。推荐按真实操作路径录一遍：

1. 如果从报告页开始，选择 `8 - Open viewer`，点击 `查看影像`。
2. 在 viewer 里选择 `1 - Open layout`，点击布局按钮；工具会自动保存 `viewer_layout_menu.png`。
3. 选择 `2 - Set layout`，点击目标布局项；必要时在面板 `Value` 中填 `2x2`。
4. 选择 `4 - Double-click series`，直接双击目标序列；序列文字会自动变成稳定 `value`。
5. 如果某些系统必须先打开序列菜单，可选择 `3 - Open series` 作为兜底；常规 zscloud 流程不需要这一步。
6. 选择 `5 - DICOM info`，点击 DICOM 信息入口；工具会自动保存 `viewer_dicom_info.png`。
7. 选择 `6 - Close dialog`，点击关闭按钮。
8. 选择 `7 - WW then WL`，先点击窗宽控件/数值，再点击窗位控件/数值；工具会分别记录 `set_window_width` 和 `set_window_level`。
9. 按 `q` 结束；如果页面拦截了普通按键，再用 `Ctrl/Cmd+Shift+Q`。

快捷键：

```text
1 open_layout_menu
2 set_layout
3 open_series_menu fallback
4 select_series by double-click
5 show_dicom_info
6 close_dialog
7 set_window_width, then set_window_level
8 open_viewer
0 manual CSV fallback
```

`Ctrl/Cmd+Shift+P` 可手动修改当前 page。特殊情况下切到 manual 后，仍可输入旧格式：

```text
action,targetPage,value,page
```

例如：

```text
AXIAL LUNG THIN -> AXIAL_LUNG_THIN
```

### 5.4 生成离线复刻页面

```bash
node bin/copylink.js build cases/zscloud_xg06q2
```

### 5.5 本地验证

```bash
node bin/copylink.js serve cases/zscloud_xg06q2
```

打开：

```text
http://127.0.0.1:4173
```

验证路径：

```text
报告页
-> 查看影像
-> viewer
-> 布局菜单
-> 选择布局
-> 序列菜单
-> 选择正确序列
-> DICOM 弹窗
-> 关闭弹窗
```

## 6. 为什么要区分 record-states 和 record-actions

弹窗截图和按钮热区是两类不同数据。

`record-states` 解决“当前界面长什么样”：

- 保存截图。
- 注册 page id。
- 适合布局菜单、序列列表、DICOM 弹窗。

`record-actions` 解决“哪里可以点、点了代表什么”：

- 获取坐标。
- 记录语义 action。
- 记录 targetPage 和 value。

拆开后好处是：

- 可以先把所有状态截图抢救下来，避免 link 过期。
- 可以后续慢慢补热区和语义，不必重新访问原站。
- 状态和动作都可以被测试和人工检查。

## 7. 隐私和安全约束

这是医学影像相关流程，必须注意：

- `report.png`、`viewer.png` 和弹窗截图可能包含真实报告、患者信息或检查信息。
- case 目录应视为敏感数据，只放在本地或受控内网环境。
- 不要把截图、完整原始 URL、viewer URL 上传到公共仓库。
- `buildCase` 会过滤 runtime 数据中的原始 URL，但截图本身仍可能包含敏感信息。
- 如需共享给同事，建议使用脱敏样本或确认数据授权。

## 8. 当前限制

当前版本仍是 MVP：

- 只实现了 `zscloud` 的基础自动入口识别。
- 其他厂商需要新增 profile 或主要依赖 `record-states` / `record-actions`。
- 不做真实 DICOM 渲染。
- 不还原原站 JS 和后端接口。
- 不自动判断“正确序列”，正确序列需要人工选择或通过外部规则提供。
- 坐标基于截图尺寸，采集和回放应保持一致 viewport。

## 9. 后续扩展建议

建议按优先级扩展：

1. 增加更多厂商 profile，自动识别 `查看影像` / `View Image`。
2. 增加可视化 annotator，用鼠标框选热区，替代文本输入。
3. 增加 batch capture 队列，支持批量 link 抢救。
4. 增加 case 校验器，自动跑完整操作路径。
5. 增加脱敏流程，把报告文本或截图中的敏感字段替换后再交给训练系统。

## 10. 交接重点

同事接手时应先理解这三个概念：

```text
page = 一个截图状态
action = 一个语义点击动作
targetPage = 点击后切到的下一个截图状态
```

只要能维护好：

```text
manifest.json 里的 screenshots
actions.json 里的 hotspots
runtime.js 里的 action 语义
```

就可以扩展更多页面、弹窗、厂商和训练流程。
