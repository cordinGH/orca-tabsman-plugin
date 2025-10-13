// Orca Tabsman Plugin - 插件入口
// 负责启动核心功能和UI注入

import { start, destroy } from './tabsman-core.js';
import { injectTabsmanContainers, cleanupTabsmanContainers } from './tabsman-ui-container.js';
import { startTabsRender, stopTabsRender, renderTabsByPanel } from './tabsman-ui-render.js';

let pluginName;

// 防重复执行标志，代表正在创建标签页
let isCreatingTab = false;


// Ctrl+单击事件监听器
function handleCtrlClick(event) {
    // 检查是否按下了Ctrl键
    if (!event.ctrlKey) return;
    
    const target = event.target;
    const className = target.className;
    let refId = null;

    // 检查是否是引用元素（orca-inline-r）（模糊匹配class）
    if (className.includes('orca-inline-r')) {
        // 获取引用ID - 从当前元素或直接父元素中查找
        refId = target.getAttribute('data-ref');
        if (!refId && target.parentElement) refId = target.parentElement.getAttribute('data-ref');
    } else if (className.includes('orca-block-handle')) {
        // 直接访问第4层父元素获取data-id属性
        refId = target.parentElement.parentElement.parentElement.parentElement.getAttribute('data-id');
    }
    
    if (!refId) return;
    
    // 检查是否正在创建标签页，防止重复执行
    if (isCreatingTab) return;
    
    // 设置防重复标志
    isCreatingTab = true;
    
    // 阻止默认行为和事件传播
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    
    // 创建后台标签页
    try {
        window.createTab(parseInt(refId), false);
        orca.notify("success", `已在后台创建新标签页 (引用ID: ${refId})`);
    } catch (error) {
        orca.notify("error", "创建标签页失败");
    } finally {
        // 延迟重置标志，防止快速连续点击
        setTimeout(() => {
            isCreatingTab = false;
        }, 500);
    }
}


// 插件加载
async function load(name) {
    pluginName = name;
    console.log(`=== ${pluginName} 加载中 ===`);
    
    // 注册设置选项
    await orca.plugins.setSettingsSchema(pluginName, {
        defaultTabOption: {
            label: "启动时左侧栏直接显示Tabs栏",
            description: "关闭则恢复orca默认行为 => 收藏栏",
            type: "boolean",
            defaultValue: true
        }
    });
    
    // 注入样式文件
    orca.themes.injectCSSResource(`${pluginName}/dist/tabsman-styles.css`, pluginName);
    
    // 注入标签页管理器容器
    await injectTabsmanContainers();
    
    // 启动标签页渲染
    await startTabsRender();
    
    // 启动标签页系统，传递UI更新回调
    await start(renderTabsByPanel);
    
    // 注册右键菜单命令（依赖window.createTab）
    orca.blockMenuCommands.registerBlockMenuCommand("tabsman.createTabInBackground", {
        worksOnMultipleBlocks: false,
        render: (blockId, rootBlockId, close) => {
            const { createElement } = window.React;
            return createElement(orca.components.MenuText, {
                preIcon: "ti ti-external-link",
                title: "在后台创建Tab",
                onClick: () => {
                    close();
                    window.createTab(blockId, false);
                    orca.notify("success", "已在后台创建新标签页");
                }
            });
        }
    });
    
    // 注册事件监听器（依赖window.createTab）
    document.addEventListener('click', handleCtrlClick, true);
    
    // 检查设置，如果启用默认显示Tabs栏
    const settings = orca.state.plugins[pluginName]?.settings;
    if (settings?.defaultTabOption) {
        const sidebarTabOptions = document.querySelector('.orca-sidebar-tab-options');
        const tabOption = document.querySelector('.plugin-tabsman-tab-option');
        if (sidebarTabOptions) {
            sidebarTabOptions.classList.add('plugin-tabsman-selected');
        }
        if (tabOption) {
            tabOption.classList.add('orca-selected');
        }
    }
    
    // 插件启动完成后，主动触发一次渲染通知
    await renderTabsByPanel();
    
    console.log(`${pluginName} 已加载`);
}

// 插件卸载
async function unload() {
    console.log(`=== ${pluginName} 卸载中 ===`);
    
    // 注销右键菜单命令
    orca.blockMenuCommands.unregisterBlockMenuCommand("tabsman.createTabInBackground");
    
    // 注销事件监听器
    document.removeEventListener('click', handleCtrlClick, true);
    
    // 清理注入的样式
    orca.themes.removeCSSResources(pluginName);
    
    // 停止标签页渲染
    stopTabsRender();
    
    // 清理注入的容器
    cleanupTabsmanContainers();
    
    // 清理标签页系统
    destroy();
    
    console.log(`${pluginName} 已卸载`);
}

// 导出插件接口
export {
    load,
    unload
};
