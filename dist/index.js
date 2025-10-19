// Orca Tabsman Plugin - 插件入口
// 负责启动核心功能和UI注入


import { start, destroy, switchToNextTab, switchToPreviousTab } from './tabsman-core.js';
import { startTabsRender, stopTabsRender, renderTabsByPanel } from './tabsman-ui-render.js';
import { startRecentlyClosed, stopRecentlyClosed } from './tabsman-recently-closed.js';
import { startbackforwardbutton, stopbackforwardbutton } from './tabsman-backforward-button.js';

let pluginName;

// 防重复执行标志，代表正在创建标签页
let isCreatingTab = false;

/**
 * 清除所有持久化数据
 * @returns {Promise<void>}
 */
async function clearAllData() {
    try {
        // 清除持久化数据
        await orca.plugins.setData('tabsman', 'recently-closed-tabs-data', "[]");
        await orca.plugins.setData('tabsman', 'pinned-tabs-data', "[]");
        await orca.plugins.setData('tabsman', 'favorite-blocks-data', "[]");
        
        orca.notify("success", "[tabsman] 持久化数据已清除，请CTRL+R刷新生效");
    } catch (error) {
        orca.notify("error", `[tabsman] 清除数据失败: ${error.message}`);
    }
}


// 更新活跃面板样式的辅助函数
function updateActivePanelStyle() {
    // 移除所有活跃样式
    const allActivePanels = document.querySelectorAll('.plugin-tabsman-panel-group.plugin-tabsman-panel-group-active');
    allActivePanels.forEach(panel => panel.classList.remove('plugin-tabsman-panel-group-active'));
    
    // 为当前活跃面板添加样式
    const activePanelGroup = document.querySelector(`.plugin-tabsman-panel-group[data-tabsman-panel-id="${orca.state.activePanel}"]`);
    if (activePanelGroup) {
        activePanelGroup.classList.add('plugin-tabsman-panel-group-active');
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
    
    // 注册清除数据命令
    orca.commands.registerCommand(
        `${pluginName}.clearData`,
        clearAllData,
        "[tabsman] 清空持久化数据"
    );
    
    // 注册标签页导航命令
    orca.commands.registerCommand(
        'tabsman.goToNextTab',
        async () => {
            const success = await switchToNextTab();
            if (success) {
                orca.notify("success", "[tabsman] 已切换到下一个标签页");
            }
        },
        '[tabsman] Go to next tab'
    );
    
    orca.commands.registerCommand(
        'tabsman.goToPreviousTab',
        async () => {
            const success = await switchToPreviousTab();
            if (success) {
                orca.notify("success", "[tabsman] 已切换到上一个标签页");
            }
        },
        '[tabsman] Go to previous tab'
    );
    
    // 启动标签页渲染
    await startTabsRender();
    
    // 启动标签页系统，传递UI更新回调
    await start(renderTabsByPanel);
    
    
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

    // 对于orca.state.activePanel 的面板group，注入 .plugin-tabsman-panel-group-active    
    const activePanelGroup = document.querySelector(`.plugin-tabsman-panel-group[data-tabsman-panel-id="${orca.state.activePanel}"]`);
    if (activePanelGroup) {
        activePanelGroup.classList.add('plugin-tabsman-panel-group-active');
    }

    // 包装 switchFocusTo 函数，使得每次切换面板都会变更.plugin-tabsman-panel-group-active元素
    const originalSwitchFocusTo = orca.nav.switchFocusTo;
    orca.nav.switchFocusTo = function(panelId) {
        originalSwitchFocusTo.call(this, panelId);
        if (panelId !== '_globalSearch') {
            updateActivePanelStyle();
        }
    };
    
    // 为面板切换命令注册 after hooks
    orca.commands.registerAfterCommand('core.switchToNextPanel', updateActivePanelStyle);
    orca.commands.registerAfterCommand('core.switchToPreviousPanel', updateActivePanelStyle);
    
    
    // 注入样式文件
    orca.themes.injectCSSResource(`${pluginName}/dist/tabsman-styles.css`, pluginName);
    
    // 启动最近关闭标签页模块
    await startRecentlyClosed(renderTabsByPanel);

    // 插件启动完成后，主动触发一次渲染通知
    renderTabsByPanel();
    
    startbackforwardbutton();
    console.log(`${pluginName} 已加载`);
}

/**
 * 插件卸载
 * @returns {Promise<void>} 返回Promise
 */
async function unload() {
    console.log(`=== ${pluginName} 卸载中 ===`);
    
    // 停止功能模块（先停止依赖模块）
    stopRecentlyClosed();
    
    // 停止UI渲染（停止UI层）
    stopTabsRender();
    
    stopbackforwardbutton();
    // 清理核心系统（最后清理核心）
    destroy();
    
    // 注销命令和样式（清理注册）
    orca.commands.unregisterAfterCommand('core.switchToNextPanel', updateActivePanelStyle);
    orca.commands.unregisterAfterCommand('core.switchToPreviousPanel', updateActivePanelStyle);
    orca.commands.unregisterCommand(`${pluginName}.clearData`);
    orca.commands.unregisterCommand('tabsman.goToNextTab');
    orca.commands.unregisterCommand('tabsman.goToPreviousTab');
    orca.themes.removeCSSResources(pluginName);
    
    console.log(`${pluginName} 已卸载`);
}

// 导出插件接口
export {
    load,
    unload
};
