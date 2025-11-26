# orca-tabsman-plugin

tabsman（**tabs man**ager -> 管理器）：用于在右侧栏为每个面板构建标签页列表。
支持`工作区（类似edge）`、`拖拽标签页至其他面板`、`置顶`、`收藏`、`最近关闭`、`前进后退历史`

## 主要更新
- v1.9.1 工作区。各个工作区相互独立，用于快速恢复tabs状态
- v1.7.0 置顶标签页中的跳转行为，会始终打开一个新标签页。
- v1.6.0 
  - 面板名称允许直接编辑，enter回车保存（并非持久化，重启会丢失）
  - tabs栏切换体验与官方的`收藏栏`、`标签栏`、`页面栏`一致
- v1.5.0 
  - tabs栏中，支持拖拽标签页至其他面板。
  - 当启用[dockpanel插件](https://github.com/cordinGH/orca-dockpanel-plugin)后，会与之有一定联动
- v1.2.1 
  - 支持创建前台/后台标签页，使用逻辑参考浏览器（ctrl + 单击、shift + ctrl + 单击
  - 右键tab图标可收藏该tab的当前块，当任一标签页访问到这个块时，图标具有一个边框样式作为视觉区分
- v1.1.0 
  - 支持了持久化操作，pin住的标签页会被持久化；最近关闭的5个标签页也会被持久化（顶部按钮查看）。
  - 最近关闭是完整的持久化，连带着对应标签页的后退前进历史

## 用法介绍（v1.0.0）

### 一、创建后台标签页

- <img width="293" height="180" alt="image" src="https://github.com/user-attachments/assets/2fd74f38-2b02-48c3-a3ea-6a771447b607" />
- 两种方法：1️⃣点击上图 + 号，默认创建今日日志的后台标签页 2️⃣ ctrl + 单击 块引用、块标，会打开对应的后台标签页

### 二、置顶标签页

- <img width="291" height="85" alt="image" src="https://github.com/user-attachments/assets/fc9ce82d-339f-4ba0-851c-35906bf4fb8c" />
- 点击上图置顶按钮，可置顶标签页。再次点击取消置顶并恢复原位。

  > 图片里看不清是因为非悬停时，非pin面板的按钮可见度给的很低

### 三、独立的前进后退历史

- 每个标签页有其独立的前进和后退历史，互不干扰。插件已拦截下图命令，执行其快捷键时，只会当前标签页的历史里前进后退。也可右键顶部按钮，会打开对应的历史菜单。

  <img width="416" height="197" alt="image" src="https://github.com/user-attachments/assets/c81b7c57-9270-4ede-8d98-65f89436df6a" />


### 四、插件命令

- 前往下一个/上一个tab，自行设置快捷键。可以试试 `alt [` 和 `alt ]` 蛮顺手的。

  <img width="500" height="166" alt="image" src="https://github.com/user-attachments/assets/5b963a5e-658a-4ff5-8bf0-f9d5d4eb24f4" />


## 安装

前往本仓库的 [Releases](https://github.com/cordinGH/orca-tabsman-plugin/releases) 页面。

在最新版本的 "Assets" 区域，下载 `Source code(zip)` 解压，解压后复制文件夹到 `orca\plugins`。  
**⭐️检查一下最终目录结构是否如下**：

```
orca-tabsman-plugin/
├── dist/
├── README.md
└── icon.png
```

**⭐️然后，退掉 orca-note 重新打开 orca-note ，插件才能被读取，这是现版本所有插件必须的一步。**

---

> [!TIP]  
> - **Q：`orca\` 目录在哪？**  
> - A：从下图进入即可看到  
>   <img width="321" height="134" alt="image" src="https://github.com/user-attachments/assets/50cf1e64-f628-42cb-8e77-82ae4083999b" />


---
