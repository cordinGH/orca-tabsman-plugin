# orca-tabsman-plugin

tabsman（**tabs man**ager -> 管理器）：用于在右侧栏为每个面板构建标签页列表。
支持`工作区（类似edge）`、`拖拽标签页至其他面板`、`置顶`、`收藏`、`最近关闭`、`前进后退历史`

## 当前功能说明

- 功能：快速记录。在日志块底部，聚焦打开一个空块  
   操作方式：在tabs侧边栏对应面板的`+`按钮上，alt + 单击。  
   > 也可以通过**命令快捷键**打开，命令列表搜索tabsman

   https://github.com/user-attachments/assets/e6f7e202-7755-4ced-8108-13067c8d14a1

- 功能：工作区，也就是将当前标签页状态 持久化保存下来，以便随时恢复。  
   用法说明：点击顶部栏对应工作区即可进入。
  
   https://github.com/user-attachments/assets/9ec710c5-5017-44bc-ab5b-6c400e18082b

- 功能：置顶标签页。置顶的标签页会持久化保存（下次打开虎鲸依旧在）  
   特别说明：各工作区内的置顶列表是独立的，取消工作区A的置顶tab，并不会影响工作区B

   https://github.com/user-attachments/assets/1241fdac-8a69-4d27-96c9-4f29c03204ac

- 功能：标签页拖拽，将一个面板的标签页拖拽到其他面板

   https://github.com/user-attachments/assets/3c4bbd2e-8d0a-4716-9850-bbd6ebb630f7

- 功能：前台打开标签页、后台打开标签页  
   操作方式（同浏览器）：ctrl + 单击，后台打开标签页；ctrl + shift + 单击，前台打开标签页。

   https://github.com/user-attachments/assets/64bfbc93-e485-4426-8c63-19a94eb4bfce

- 功能：最近关闭的标签页。自动保存最近关闭的5个标签页，以便手误时可以恢复。支持快捷键快速恢复。

   https://github.com/user-attachments/assets/df4cdbb5-ae88-48df-b88d-d92cf7a6a34e

- 功能：各个标签页具有独立的前进后退历史。  
  查看方式：查看当前标签页历史，右键`前进后退`按钮。  
    <img width="300" height="100" alt="PixPin_2026-03-09_17-00-38" src="https://github.com/user-attachments/assets/3112cc83-2f17-43f5-a551-b544be0edd25" />

- 功能：收藏块，点击标签页图标可以将块收藏进插件中，再次点击图标即可取消。  
    <img width="254" height="121" alt="PixPin_2026-03-09_17-02-44" src="https://github.com/user-attachments/assets/ebd9ee42-d323-47f0-b10e-2dfb180fc46c" />  
    <img width="400" height="120" alt="PixPin_2026-03-09_17-03-38" src="https://github.com/user-attachments/assets/10d34496-2cde-460a-ae50-303fd9674fae" />

- 功能：标签页支持悬停预览，工作区支持自动恢复。可以在设置选项中自选启用（默认开启）。
   <img width="650" height="117" alt="image" src="https://github.com/user-attachments/assets/58c5abdc-cf96-4306-89e1-cc404f8c7d9e" />

- 插件命令   
   <img width="622" height="220" alt="PixPin_2026-03-09_17-07-08" src="https://github.com/user-attachments/assets/bed046a7-5236-4a67-ada5-fc650d7b7513" />



## 更新日志
- v3.4.0 优化插件tooltip，标签页支持悬停预览，工作区支持自动恢复（设置选项中启用）
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
