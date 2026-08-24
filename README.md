# MinecraftSniper 博客模板 MAX 版（EOL）

> MinecraftSniper 博客模板的 **最终版本**，功能开发已全部完成，代码将维持当前状态，**不再提供任何更新**（包括安全修复）。  
> **此版本适合作为稳定终版长期使用，不建议用于对安全性有持续更新需求的场景。**

**基础版链接：** [MinecraftSniper 博客模板](https://gitee.com/Minecraft-Sniper/minecraftsniperblogtemplate)  
**Pro 版链接：** [MinecraftSniper 博客模板 Pro](https://gitee.com/Minecraft-Sniper/minecraftsniperblogtemplatepro)  
**Pro+ 版链接：** [MinecraftSniper 博客模板 Pro+](https://gitee.com/Minecraft-Sniper/minecraftsniperbokemubanm)

---

## 📖 项目简介

MinecraftSniper 博客模板 MAX 版是一个**轻量、安全、可管理**的个人博客系统，基于 Node.js + Express 构建，以 Markdown 文件作为内容源，无数据库依赖，开箱即用。

**这是本项目功能开发的最终版本，后续不再有任何形式的更新：**

- 🚀 **磁盘监控方案重构**：使用 `fs.statfsSync` 原生 API 替代系统命令（`df` / `wmic` / PowerShell），无需外部依赖，跨平台更可靠
- 🔒 **前台博客 HTTPS 支持**：前台服务可独立启用 HTTPS，与后台共用证书，实现全站加密
- 🎯 **更精准的磁盘统计**：统计项目所在分区而非整个系统，数据更贴合实际使用场景
- 🏁 **标记为 EOL 版本**：功能开发已全部完成，代码冻结，不再维护

---

## ⚠️ EOL 声明

本版本以及以下版本已标记为 **EOL（End-of-Life）**，即生命周期终止版本：

- **MinecraftSniper 博客模板**
- **MinecraftSniper 博客模板 Pro**
- **MinecraftSniper 博客模板 Pro+**
- **MinecraftSniper 博客模板 MAX 版（本版本）**

这意味着：

- ✅ **软件仍可正常使用**：所有功能完整可用
- ❌ **不再提供任何更新**：包括安全补丁、功能补丁、兼容性修复
- ❌ **不保证与新环境的兼容性**：如 Node.js 未来版本或新操作系统出现兼容问题，将不予修复
- ❌ **官方技术支持终止**：不再响应 Issue 和 PR

**选择版本的风险**：若未来发现安全漏洞或与运行环境产生兼容性问题，将无法获得官方修复。建议仅在非关键环境下评估风险的前提下使用。

---

## ✨ 功能特性

### 前台博客
- **Markdown 写文章**：在 `content/posts/` 中新建 `.md` 文件即可发布
- **动态发布**：在 `content/moments/` 中新建 `.md` 文件发布短动态
- **热更新**：修改 Markdown 文件后，前端自动刷新（无需重启服务）
- **四页面导航**：主页、文章列表、动态列表、关于我
- **响应式设计**：适配桌面端和移动端
- **视觉风格**：参考 HarmonyOS NEXT，支持液态玻璃质感和沉浸光效
- **🔒 HTTPS 支持**：通过修改 `config.json` 配置证书路径，可一键启用前台 HTTPS

### 后台管理
- **🔐 私钥认证**：RSA 2048 位密钥对登录，无需记忆密码
- **📊 性能监控面板**：
  - **CPU 使用率**：实时百分比 + 系统负载（1/5/15 分钟）
  - **磁盘使用率**：已用/总容量 + 占用百分比（**纯原生 API 实现，无外部命令依赖**）
  - **网络流量**：实时上下行速率（Mbps），支持 Linux 和 Windows
  - **系统内存**：已用/总量 + 使用百分比
  - **Node 进程内存**：RSS、堆使用/总大小
  - **缓存状态**：当前模式（自动/手动/停用）、缓存数据大小、上限
  - **内容统计**：文章数、动态数、总字数
  - **服务运行时间**：已运行时长 + 启动时间
  - **最近日志**：实时查看 `logs/` 目录的最新日志
- **📝 文章管理**：上传 `.md` 文件、下载文章、删除文章
- **✨ 动态管理**：上传 `.md` 文件、下载动态、删除动态
- **🧠 内存缓存管理**：可视化切换 `auto/true/false` 模式，调整缓存上限
- **⚙️ 系统信息**：Node 版本、运行时长、依赖版本、版权信息
- **🔌 SSE 实时推送**：提供 `/api/admin/status/stream` 端点，支持前端仪表盘实时更新

### 技术特性
- **极低资源占用**：256MB 内存即可运行
- **无数据库**：所有内容以 Markdown 文件存储，复制即备份
- **内存缓存管理**：支持 `auto`（自动）/ `true`（手动）/ `false`（禁用）三种模式
- **定时内存检查**：每 30 秒自动检测内存，紧张时自动降级
- **HTTPS 自动适配**：后台管理界面默认 `auto`，证书存在时自动启用；前台博客需手动配置启用
- **中文文件名支持**：上传中文名的 `.md` 文件无乱码
- **跨平台监控**：CPU / 网络信息在 Linux 和 Windows 上均可采集
- **纯原生磁盘监控**：使用 `fs.statfsSync` 获取项目所在分区信息，无需 `df` / `wmic` 等外部命令

---

## 🛠️ 技术栈

| 组件 | 技术 |
| :--- | :--- |
| 服务端 | Node.js + Express |
| 前端 | 原生 HTML/CSS/JavaScript |
| 内容源 | Markdown 文件 |
| 文件上传 | Multer |
| 热更新 | chokidar |
| 认证 | RSA 2048 + JWT |
| 日志 | 控制台 + 按天轮转文件 |
| 系统监控 | Node.js `os` 模块 + `fs.statfsSync` 原生 API |
| 实时推送 | Server-Sent Events (SSE) |

---

## ⚙️ 配置说明

### 前台博客 HTTPS（默认禁用）

前台博客的 HTTPS 默认**不启用**，这是有意为之的设计：

- **性能考量**：Node.js 处理 TLS 加解密会消耗额外 CPU 资源，反向代理（如 Nginx、Caddy）处理 TLS 更高效
- **架构灵活性**：推荐在生产环境使用反向代理做 TLS 终结，前端服务保持 HTTP 即可，便于统一管理证书和负载均衡

如需直接启用，请编辑 `config.json` 文件：

```json
{
  "https": {
    "enable": "true",      // 改为 "true" 或 "auto" 可启用
    "keyPath": "sslkey/你的私钥文件.key",
    "certPath": "sslkey/你的证书文件.crt"
  }
}
```

- **enable** 可选 `"true"`（强制启用）、`"false"`（禁用）、`"auto"`（自动检测，证书存在则启用）
- 证书文件需放置在项目根目录下的 `sslkey/` 文件夹内
- **默认值为 `"false"`**，用户按需开启

### 后台管理 HTTPS（默认自动）

后台管理的 HTTPS 配置在 `adminconfig.json` 中，默认 `"auto"`（证书存在即启用），也可手动设置为 `"true"` 或 `"false"`。

---

**注意：本版本的启动命令与标准版、Pro以及Pro+不通用，本版本的启动命令是：**


```
bash
    pnpm server
```


---

## 📁 目录结构

详细的目录结构请查看：[目录结构概览.txt](https://gitee.com/Minecraft-Sniper/minecraftsniperblogtemplatepro/blob/master/%E7%9B%AE%E5%BD%95%E7%BB%93%E6%9E%84%E6%A6%82%E8%A7%88.txt)

---

## ⚠️ 安全提醒

- 管理端口请勿直接暴露至公网，建议通过内网或 VPN 访问。
- 私钥文件请妥善保管，丢失后需验证旧私钥才能重置。
- 生产环境建议启用 HTTPS 并设置 `https.enabled = true`。

---

## 🔗 相关链接

- [基础版](https://gitee.com/Minecraft-Sniper/minecraftsniperblogtemplate)
- [Pro 版](https://gitee.com/Minecraft-Sniper/minecraftsniperblogtemplatepro)
- [Pro+ 版](https://gitee.com/Minecraft-Sniper/minecraftsniperbokemubanm)
- [MAX 版（本仓库）](https://github.com/MinecraftSniper/minecraftsniperblogtemplatepro)

---

## 📄 版权信息

© 林鋆成 All Rights Reserved.  
本软件及所有相关代码、文档、设计均受著作权法保护。未经版权所有者书面授权，不得复制、修改、分发或用于商业用途。