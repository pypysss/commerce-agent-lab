---
name: Commerce Lab
description: 商品查询工作台的已实现界面约定
colors:
  primary: "#17634c"
  page: "#f4f6f5"
  surface: "#ffffff"
  text: "#253d35"
  muted: "#60716b"
  line: "#dce4df"
  selected: "#edf5f0"
  error: "#9a4235"
  focus: "#459a7c"
typography:
  headline:
    fontFamily: '"Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif'
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  title:
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.5
rounded:
  panel: "12px"
  control: "6px"
  compact: "4px"
spacing:
  tight: "8px"
  compact: "12px"
  regular: "16px"
  section: "24px"
  outer: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "40px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
---

# Commerce Lab 界面约定

第三步沿用以下商品工作台视觉约定，在商品区后添加页面内订单面板：先显示登录/会话，再显示当前所选商品、数量与下单入口，最后列出本人订单和模拟支付。没有新增图表、地图或独立站点。所有新标签、错误、状态及 ARIA 延续三语词典。390px 下订单行换行，表单控件不撑宽页面。当前验收看 docs/step-03/HANDOFF-step-03.md；下文商品布局来自第二步。

第二步商品查询使用 Operate 模式。页面让使用者快速扫描商品、价格和库存，再打开详情；不增加与当前业务无关的数据图、指标或装饰。此处记录已实施的界面，未声称全项目设计系统已经完成。

## 布局与信息顺序

- 顶栏显示项目名、工作台说明与原生语言下拉框；选项固定使用「中文 / English / 日本語」，手机仍保留语言选择。主区先给商品查询标题及刷新入口，再给商品列表与详情面板。
- 桌面采用列表主栏与 306px 详情栏；小于 900px 纵向排列。小于 560px 调整边距与表格密度；特别窄的窗口允许表格容器横向滚动，页面本身不横向溢出。
- 详情为常驻面板，不使用模态窗。未选商品时说明选择方式；选中后独立请求详情接口。
- 搜索字段使用「筛选当前页」标签，不能暗示全库搜索能力。

## Tokens

| 用途 | 值 | 使用位置 |
|---|---|---|
| 页面背景 | `#f4f6f5` | body、页面底色 |
| 内容背景 | `#ffffff` | 列表、详情、按钮 |
| 主要文字 | `#253d35` | 正文、名称与金额 |
| 次要文字 | `#60716b` | 描述、说明、SKU |
| 操作强调 | `#17634c` | 主按钮、详情操作、价格重点 |
| 分隔线 | `#dce4df` | 面板边界与分区 |
| 当前选择 | `#edf5f0` | 已选商品行 |
| 错误文字 | `#9a4235` | 加载失败标题 |
| 焦点环 | `#459a7c` | 3px、offset 3px |
| 面板圆角 | `12px` | 列表与详情外框 |
| 控件圆角 | `6px` | 搜索框、按钮 |
| 常规间距 | `8 / 12 / 16 / 24 / 32px` | 控件、表格、分区 |

字体采用本机 Segoe UI / Microsoft YaHei / PingFang SC / sans-serif，不请求远程字体。标题 28px、面板标题 17px、商品名 14px、数据与操作 12–13px；手机主标题 24px。数据使用 tabular-nums，价格与库存右对齐。SKU 是普通数据文本，不以全局等宽字体制造技术感。

## 控件与状态

- 使用原生 `button`、`input type="search"`、`table`、`th scope="col"`、`aside`，按钮不依赖可点击 div。
- 列表和详情分别拥有 loading / success / error 状态。空数据属于成功分支：区分数据库没有商品与关键词没有匹配。
- 正在请求时保留骨架占位；刷新按钮暂时禁用，避免重复操作。
- 详情切换前清空旧详情；请求取消和请求序号共同避免过期响应覆盖当前选择。
- 错误文本使用 Vue 插值，所有恢复操作均为真实按钮，分别重试列表或详情。
- 页面文案和 ARIA 从三语词典读取；错误保留结构化分类，切换语言时已有错误立即重译。商品名与描述保留数据库原文；CNY 金额不随语言换汇。
- 所有展示文案按前端词典与结构化错误生成，不因切换额外请求。后端只返回稳定 code、状态和固定安全中文兜底 message；api.ts 不依赖界面语言，不显式设置 Accept-Language。页面不直接显示服务端 message，未知 code 使用当前语言通用提示。日志与框架错误的整体翻译不在本轮范围。
- hover / active / disabled / focus-visible 样式保持一致。表格选中行与「已选择」文字共同表达状态。

## 响应与无障碍

显示「跳到商品列表」键盘跳转入口。搜索框有可见标签；图标是同一 1.6px 描边 SVG 且不向辅助技术重复报读。加载使用 role=status，错误使用 role=alert；所选详情区域用 aria-live=polite。隐藏的表格 caption 保留数据含义。用户偏好 reduced motion 时关闭骨架动画和过渡。

页面没有营销动画、外部图片、渐变、装饰性图表或可疑业务统计。骨架只表达加载，交互过渡为 160ms。浏览器默认滚动条保持原生行为，文本选择、光标与焦点环使用主题颜色。

## 验证边界

源码具备上述状态与行为不等于已经浏览器验证。具体桌面、移动、键盘、真实接口和失败实验结果以 `docs/step-02` 及 `evidence/step-02` 的最终验收记录为准。
