# ASTRA·4D — 四维远征

在浏览器里运行的四维 `(x, y, z, w)` 探索游戏，以低多边形、粉彩星野的几何美学致敬 ASTRONEER。

> **[▶ 在线试玩](https://jerrygriffin.github.io/astra-4d/)** · 无需安装，打开浏览器即可开始
>
> 当前版本 **0.2.0**（2026-11-11），改动记录见 [CHANGELOG.md](CHANGELOG.md)。

## 玩法

- **W A S D** 移动，**Shift** 疾跑，**空格** 跳跃，拖拽鼠标转动视角
- **Q / E** 沿相位轴 `w` 连续滑移。地形、矿脉、系绳都是 `w` 的连续函数，滑移时整个世界平滑「呼吸」，并叠加两层相位幽灵地形。相位轴范围为 **±6.5**，滑到边界会停住并提示按 Q 返回
- **按住左键** 采集资源。资源只在与其相位对齐时可见、可采，相位不对会收到提示
- **F** 放置系绳桩，接入氧气管网后回氧、回血；离开管网氧气持续下降，耗尽后生命归零并回到最近的系绳桩。最多同时存在 **80 根**，放满后自动回收离玩家最远的一根
- **H** 折叠 / 展开操作提示

## 技术说明

- 纯原生 HTML / CSS / JavaScript，**零构建、零框架、零运行时网络请求**；可直接双击 `index.html`，或由任意静态服务器托管
- 静态资源带 `?v=0.2.0` 版本串；改动代码后先写 `CHANGELOG.md`，再运行 `node bump-version.mjs <新版本>` 统一升版，以击穿浏览器缓存
- `vendor/three.min.js` 为 Three.js 经典 UMD 构建（全局 `THREE`），负责 WebGL 渲染；`main.js` 为单文件 IIFE + 严格模式，约 1200 行，按 15 个小节组织
- 核心是四维值噪声：`hash4 / quintic / noise4 / fbm4` → `terrainHeight(x, z, w)`，再驱动主地形网格与幽灵地形的顶点、颜色逐帧更新
- 字体 Outfit / Space Mono 已本地化为 8 个 `woff2`，由 `fonts/fonts.css` 以相对路径引用，离线可用
- `fonts/gf.css` 是 Google Fonts 原始 CSS 备份，**未被页面引用**，删除不影响运行

## 目录结构

```text
.
├── index.html            # 标题幕 / HUD / 死亡幕（静态资源版本串在此）
├── style.css             # 界面与视觉样式
├── main.js               # 噪声、地形、资源、玩家、系绳、粒子、主循环
├── CHANGELOG.md          # 更新日志
├── bump-version.mjs      # 版本串同步 / 缓存击穿（Node，零依赖，不参与运行）
├── README.md
├── fonts/
│   ├── fonts.css         # 实际生效的本地字体声明
│   ├── gf.css            # 未被引用的 Google Fonts 原始 CSS
│   └── f0~f7.woff2       # 本地字体文件
└── vendor/three.min.js   # Three.js（MIT）
```

## 本地运行

```bash
python -m http.server 8765
# 打开 http://127.0.0.1:8765/
```

推荐 Chrome / Edge 等支持 WebGL 的现代浏览器。

## 第三方组件

- Three.js：MIT License，Copyright 2010-2021 Three.js Authors（见 `vendor/three.min.js` 头部）
- Outfit / Space Mono 字体：SIL Open Font License，经 Google Fonts 本地化分发
