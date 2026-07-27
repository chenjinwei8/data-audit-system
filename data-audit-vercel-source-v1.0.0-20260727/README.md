# 数据运营服务审量系统前端

这是用于上传 GitHub 并部署到 Vercel 的前端源码包。

## 本地运行

```bash
npm install
copy .env.example .env
npm run dev
```

在 `.env` 中填写：

```text
VITE_SUPABASE_URL=你的 Supabase Project URL
VITE_SUPABASE_ANON_KEY=你的 Supabase anon/public key
```

不要在前端配置 Supabase `service_role` key。

## Vercel 部署

1. 将本目录内全部文件上传到 GitHub 仓库根目录。
2. 在 Vercel 导入该仓库，Framework Preset 选择 `Vite`。
3. 配置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。
4. Build Command 使用 `npm run build`，Output Directory 使用 `dist`。
5. 部署后根据 `VERCEL_DEPLOYMENT.md` 完成 Supabase URL 和权限验收。

项目已经通过 32 项自动测试和生产构建验证。
