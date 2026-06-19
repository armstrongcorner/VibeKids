# Vibe Kids Studio

Vibe Kids Studio 是一个基于 Node.js 和 Express 的儿童编程作品展示与上传平台。它可以接收项目 zip 文件，将作品解压到独立的运行目录，并提供公开作品画廊和管理员上传页面。

English documentation is available in [README.md](./README.md).

## 功能

- 公开作品画廊。
- 管理员项目上传页面。
- 通过 `/runner/:slug` 运行单个作品。
- 支持通过 `manifest.json` 提供项目元数据。
- 内置 Caddy 反向代理配置，方便绑定域名访问。

## 环境要求

- Node.js 18 或更高版本。
- npm。
- Caddy，如需使用仓库中的反向代理配置。

## 本地运行

安装依赖：

```bash
npm install
```

启动 Node 应用：

```bash
npm start
```

开发时可以使用自动重启模式：

```bash
npm run dev
```

默认情况下，Node 服务监听 `http://127.0.0.1:4321`。也可以通过 `HOST` 和 `PORT` 覆盖：

```bash
HOST=0.0.0.0 PORT=4321 npm start
```

## 使用 Caddy 运行

当前 `Caddyfile` 会将 `vibekids.ddns.net` 代理到本机的 Node 服务 `127.0.0.1:4321`。

先启动 Node 应用，然后在项目目录运行：

```bash
caddy run
```

访问地址：

- 作品画廊：`https://vibekids.ddns.net`
- 上传页面：`https://vibekids.ddns.net/admin.html`

如果只在本地使用，可以把 `Caddyfile` 里的站点地址改回 `vibekids.localhost`。

## 项目 Zip 格式

上传的 `.zip` 文件需要在根目录包含 `index.html`，或者在唯一的一级目录中包含 `index.html`。

可以在 `index.html` 同级放置可选的 `manifest.json`：

```json
{
  "title": "Project title",
  "description": "Short description",
  "cover": "cover.png",
  "tags": ["game", "animation"],
  "date": "2026-06-17"
}
```

如果提供 `cover`，它应指向上传项目中的某个文件。

## 运行时数据

上传和生成的项目数据会保存在以下已忽略的目录中：

- `data/`
- `uploads/`
- `projects/`
- `.tmp/`

这些目录不会提交到 Git。

## 测试

运行测试：

```bash
npm test
```

## 仓库地址

GitHub: [armstrongcorner/VibeKids](https://github.com/armstrongcorner/VibeKids)
