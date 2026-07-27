# Vercel 前端部署说明

## 1. 导入项目

1. 将当前代码推送到 GitHub、GitLab 或 Bitbucket。
2. 登录 Vercel，选择 `Add New...` -> `Project`，导入代码仓库。
3. 如果导入的是整个 `test2` 仓库，将 Root Directory 设置为：

   `data-audit-system/frontend`

4. Framework Preset 选择 `Vite`。项目中的 `vercel.json` 已配置：

   - Build Command：`npm run build`
   - Output Directory：`dist`
   - React Router SPA 路由回退到 `/index.html`

## 2. 配置环境变量

在 Vercel 项目的 Settings -> Environment Variables 中增加：

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | 当前 Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | 当前 Supabase anon/public key |

建议同时勾选 Production、Preview、Development。修改环境变量后必须重新部署。

不要将 Supabase `service_role` key 配置到 Vercel 前端，也不要提交本地 `.env`。`anon` key 会进入浏览器代码，其安全边界由现有 RLS 策略保证。

## 3. Supabase 设置

部署完成并获得类似 `https://your-project.vercel.app` 的地址后：

1. 打开 Supabase Dashboard。
2. 进入 Authentication -> URL Configuration。
3. 将 Site URL 设置为正式 Vercel 地址。
4. 在 Redirect URLs 中增加正式地址和预览地址规则，例如：

   `https://your-project.vercel.app/**`

当前邮箱密码登录不依赖邮件跳转，但该配置是后续密码重置、邮件确认和第三方登录的必要条件。

## 4. 上线验收

依次检查：

1. 直接访问首页能够显示登录页。
2. 刷新 `/catalog`、`/project/项目ID` 等深层地址不会出现 404。
3. 超级管理员、团队管理员和普通成员能够登录。
4. 不同团队的数据隔离仍然生效。
5. 服务单、申报单、验收单附件能够上传和下载。
6. 三类管理页面导出文件正常。

## 5. 常见问题

- 页面提示 Supabase 配置缺失：检查 Vercel 环境变量名称，重新部署后再访问。
- 深层页面刷新 404：确认仓库根目录中的 `vercel.json` 被 Vercel 读取，Root Directory 必须指向本前端目录。
- 登录失败：检查 Supabase 账号是否启用、团队是否启用，以及 Vercel 使用的 URL 和 anon key 是否属于同一个 Supabase 项目。
- 页面部署成功但数据为空：确认用户所属团队、RLS 权限和 Supabase 项目是否正确，不要改用 `service_role` key 绕过权限。
