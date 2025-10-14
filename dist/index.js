// Orca Tabsman Plugin - 插件入口
// 负责启动核心功能和UI注入


import { start, destroy } from './tabsman-core.js';
import { injectTabsmanContainers, cleanupTabsmanContainers } from './tabsman-ui-container.js';
import { startTabsRender, stopTabsRender, renderTabsByPanel } from './tabsman-ui-render.js';
import { startRecentlyClosed, stopRecentlyClosed } from './tabsman-recently-closed.js';

let pluginName;

// 防重复执行标志，代表正在创建标签页
let isCreatingTab = false;

// 更新活跃面板样式的辅助函数
function updateActivePanelStyle() {
    // 移除所有活跃样式
    const allActivePanels = document.querySelectorAll('.plugin-tabsman-panel-group.active-panel');
    allActivePanels.forEach(panel => panel.classList.remove('active-panel'));
    
    // 为当前活跃面板添加样式
    const activePanelGroup = document.querySelector(`.plugin-tabsman-panel-group[data-panel-id="${orca.state.activePanel}"]`);
    if (activePanelGroup) {
        activePanelGroup.classList.add('active-panel');
    }
}


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
        orca.notify("success", `[tabsman] 已在后台创建新标签页 (引用ID: ${refId})`);
    } catch (error) {
        orca.notify("error", "[tabsman] 创建标签页失败");
    } finally {
        // 延迟重置标志，防止快速连续点击
        setTimeout(() => {
            isCreatingTab = false;
        }, 500);
    }
}


/**
 * 插件加载
 * @param {string} name - 插件名称
 * @returns {Promise<void>} 返回Promise
 */
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
    
    // 启动最近关闭标签页模块
    await startRecentlyClosed(renderTabsByPanel);
    
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
                    orca.notify("success", "[tabsman] 已在后台创建新标签页");
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

    // 对于orca.state.activePanel 的面板group，注入 .active-panel    
    const activePanelGroup = document.querySelector(`.plugin-tabsman-panel-group[data-panel-id="${orca.state.activePanel}"]`);
    if (activePanelGroup) {
        activePanelGroup.classList.add('active-panel');
    }

    // 包装 switchFocusTo 函数，使得每次切换面板都会变更.active-panel元素
    const originalSwitchFocusTo = orca.nav.switchFocusTo;
    orca.nav.switchFocusTo = function(panelId) {
        originalSwitchFocusTo.call(this, panelId);
        updateActivePanelStyle();
    };
    
    // 为面板切换命令注册 after hooks
    orca.commands.registerAfterCommand('core.switchToNextPanel', updateActivePanelStyle);
    orca.commands.registerAfterCommand('core.switchToPreviousPanel', updateActivePanelStyle);
    
    console.log(`${pluginName} 已加载`);
}

/**
 * 插件卸载
 * @returns {Promise<void>} 返回Promise
 */
async function unload() {
    console.log(`=== ${pluginName} 卸载中 ===`);
    
    // 注销右键菜单命令
    orca.blockMenuCommands.unregisterBlockMenuCommand("tabsman.createTabInBackground");
    
    // 注销事件监听器
    document.removeEventListener('click', handleCtrlClick, true);
    
    // 注销面板切换命令的 after hooks
    orca.commands.unregisterAfterCommand('core.switchToNextPanel', updateActivePanelStyle);
    orca.commands.unregisterAfterCommand('core.switchToPreviousPanel', updateActivePanelStyle);
    
    // 清理注入的样式
    orca.themes.removeCSSResources(pluginName);
    
    // 停止标签页渲染
    stopTabsRender();
    
    // 清理注入的容器
    cleanupTabsmanContainers();
    
    // 停止最近关闭标签页模块
    await stopRecentlyClosed();
    
    // 清理标签页系统
    destroy();
    
    console.log(`${pluginName} 已卸载`);
}

// 导出插件接口
export {
    load,
    unload
};
