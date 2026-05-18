# Disc Stats PWA

一个参考 UltiAnalytics 工作流的飞盘比赛数据记录网页应用。它使用 Next.js + Supabase + PWA 构建，默认离线优先：即使还没有配置 Supabase，也可以在浏览器本地记录两支队伍的比赛、实时统计并导出 CSV。

## 功能

- 在同一个网页里创建主队 / 客队双队比赛
- 分别管理两队球员和场上阵容
- 在比赛中切换当前记录队伍
- 记录成功传盘、助攻、得分、接盘失误、传盘失误、Stall、D盘
- Drop、Throwaway、Stall 后自动切换控盘队
- 得分后自动给当前队伍加分，并切换到另一队
- 撤销最近一次事件
- 分队统计个人得分、助攻、D、Drop、传盘成功率、接盘成功率、+/-
- 分队统计传盘成功率、接盘成功率、总失误、D盘
- IndexedDB 本地保存
- PWA manifest + service worker 离线缓存
- 导出球员统计 CSV 和两队事件流水 CSV
- Supabase snapshot 同步接口占位

## 本地运行

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

当前开发环境里我也启动了一个最新构建服务：

```text
http://localhost:3001
```

## Supabase 配置

复制环境变量文件：

```bash
cp .env.example .env.local
```

填入：

```env
NEXT_PUBLIC_SUPABASE_URL=你的 Supabase Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 Supabase anon public key
```

在 Supabase SQL Editor 里执行：

```sql
create table if not exists public.app_snapshots (
  team_id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_snapshots enable row level security;

create policy "Allow anonymous snapshot upsert for MVP"
on public.app_snapshots
for all
using (true)
with check (true);
```

这是 MVP 版本为了快速验证做的 snapshot 同步。正式上线时建议改成登录后按 `teams`、`players`、`games`、`points`、`events` 分表同步，并把 RLS 改成队伍成员权限。

## 生产部署

推荐 Vercel：

```bash
npm run build
```

然后在 Vercel 项目里配置同样的两个 Supabase 环境变量。部署完成后，你会得到一个可以直接发给队员使用的网站链接。

## 后续建议

- 增加用户登录和队伍成员角色
- 把 snapshot 同步升级为事件级同步
- 增加分点图、传盘网络图、阵容效率
- 增加比赛模板和固定 O-line / D-line
- 增加视频时间轴标记
