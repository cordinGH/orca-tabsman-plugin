// Orca Tabsman Plugin - 插件入口
// 负责启动核心功能和UI注入


import { start, destroy, switchToNextTab, switchToPreviousTab } from './tabsman-core.js';
import { startTabsRender, stopTabsRender, renderTabsByPanel } from './tabsman-ui-render.js';
import { startRecentlyClosed, stopRecentlyClosed } from './tabsman-recently-closed.js';
import { startbackforwardbutton, stopbackforwardbutton } from './tabsman-backforward-button.js';

let pluginName;

// 防重复执行标志，代表正在创建标签页
let isCreatingTab = false;

// 设置取消订阅
let unsubscribeSettings = null;

// 存储原始导航 API 函数
let originalSwitchFocusTo = null;
let originalFocusNext = null;
let originalFocusPrev = null;

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


/**
 * 插件加载
 * @param {string} name - 插件名称
 * @returns {Promise<void>} 返回Promise
 */
async function load(name) {
    pluginName = name;
    console.log(`=== ${pluginName} 加载中 ===`);

    // 注入样式文件
    orca.themes.injectCSSResource(`${pluginName}/dist/tabsman-styles.css`, pluginName);

    // 包装导航 API，使得每次切换面板都会变更.plugin-tabsman-panel-group-active元素
    originalSwitchFocusTo = orca.nav.switchFocusTo;
    orca.nav.switchFocusTo = function(panelId) {
        originalSwitchFocusTo.call(this, panelId);
        if (panelId !== '_globalSearch') {
            updateActivePanelStyle();
        }
    };

    originalFocusNext = orca.nav.focusNext;
    orca.nav.focusNext = async function() {
        const result = await originalFocusNext.call(this);
        if (orca.state.activePanel !== '_globalSearch') {
            updateActivePanelStyle();
        }
        return result;
    };

    originalFocusPrev = orca.nav.focusPrev;
    orca.nav.focusPrev = async function() {
        const result = await originalFocusPrev.call(this);
        if (orca.state.activePanel !== '_globalSearch') {
            updateActivePanelStyle();
        }
        return result;
    };

    // 启动标签页渲染    
    await startTabsRender();
    // 启动标签页系统，传递UI更新回调
    await start(renderTabsByPanel);
    
    // 插件启动完成后，主动触发一次渲染通知
    renderTabsByPanel();

    // 注册设置选项
    await orca.plugins.setSettingsSchema(pluginName, {
        defaultTabOption: {
            label: "启动时左侧栏直接显示Tabs栏",
            description: "关闭则恢复orca默认行为 => 收藏栏",
            type: "boolean",
            defaultValue: true
        },
        enableClearData: {
            label: "启用命令：清空持久化数据",
            description: "启用后可以在命令面板中使用清空持久化数据功能",
            type: "boolean",
            defaultValue: true
        }
    });
    
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
    
    // 注册开关侧边Tabs栏命令
    const sidebarTabOptions = document.querySelector('.orca-sidebar-tab-options');
    const tabOption = document.querySelector('.plugin-tabsman-tab-option');
    const appDiv = document.body.querySelector(':scope > #app');
    orca.commands.registerCommand(
        'tabsman.toggleSidebarTabsman',
        () => {
            if (appDiv.classList.contains('sidebar-closed')) {
                orca.commands.invokeCommand('core.toggleSidebar');
                sidebarTabOptions.classList.add('plugin-tabsman-selected');
                tabOption.classList.add('orca-selected');
            } else {
                if (sidebarTabOptions.classList.contains('plugin-tabsman-selected')) {
                    orca.commands.invokeCommand('core.toggleSidebar');
                } else {
                    sidebarTabOptions.classList.add('plugin-tabsman-selected');
                    tabOption.classList.add('orca-selected');
                }
            }
        },
        '[tabsman] 开启/关闭显示侧边Tabs栏'
    );


        
    // 监听设置变化，动态控制清空持久化数据命令的可用性
    unsubscribeSettings = window.Valtio.subscribe(orca.state.plugins[pluginName], () => {
        const enableClearData = orca.state.plugins[pluginName]?.settings?.enableClearData;
        if (enableClearData === false) {
            // 禁用命令
            try {
                orca.commands.unregisterCommand('tabsman.clearData');
                orca.notify("success", "[tabsman] 清空持久化数据命令已禁用");
            } catch (e) { /* 忽略错误 */ }
        } else if (enableClearData === true) {
            // 启用命令
            try {
                orca.commands.registerCommand(
                    'tabsman.clearData',
                    clearAllData,
                    "[tabsman]清空持久化数据"
                );
                orca.notify("success", "[tabsman] 清空持久化数据命令已启用");
            } catch (e) { /* 忽略错误 */ }
        }
    });

    
    // 检查设置，如果启用默认显示Tabs栏
    const settings = orca.state.plugins[pluginName]?.settings;
    if (settings?.defaultTabOption) {
        if (sidebarTabOptions) {
            sidebarTabOptions.classList.add('plugin-tabsman-selected');
        }
        if (tabOption) {
            tabOption.classList.add('orca-selected');
        }
    }
    if (settings?.enableClearData) {
        orca.commands.registerCommand(
            'tabsman.clearData',
            clearAllData,
            "[tabsman]清空持久化数据"
        );
    }
    

    // 对于orca.state.activePanel 的面板group，注入 .plugin-tabsman-panel-group-active    
    const activePanelGroup = document.querySelector(`.plugin-tabsman-panel-group[data-tabsman-panel-id="${orca.state.activePanel}"]`);
    if (activePanelGroup) {
        activePanelGroup.classList.add('plugin-tabsman-panel-group-active');
    }
    
    // 为面板切换命令注册 after hooks
    orca.commands.registerAfterCommand('core.switchToNextPanel', updateActivePanelStyle);
    orca.commands.registerAfterCommand('core.switchToPreviousPanel', updateActivePanelStyle);
    
    // 启动最近关闭标签页模块
    await startRecentlyClosed(renderTabsByPanel);
    
    // 启动前进后退按钮模块
    startbackforwardbutton();
    console.log(`=== ${pluginName} 加载完毕 ===`);
}



// 更新活跃面板样式的辅助函数
function updateActivePanelStyle() {
    // 移除所有活跃样式
    let activePanel = document.querySelector('.plugin-tabsman-panel-group.plugin-tabsman-panel-group-active');
    if (activePanel) {
        activePanel.classList.remove('plugin-tabsman-panel-group-active');
    }
    
    // 为当前活跃面板添加样式
    activePanel = document.querySelector(`.plugin-tabsman-panel-group[data-tabsman-panel-id="${orca.state.activePanel}"]`);
    if (activePanel) {
        activePanel.classList.add('plugin-tabsman-panel-group-active');
    }
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
    
    // 恢复原始导航 API 函数
    if (originalSwitchFocusTo) {
        orca.nav.switchFocusTo = originalSwitchFocusTo;
        originalSwitchFocusTo = null;
    }
    if (originalFocusNext) {
        orca.nav.focusNext = originalFocusNext;
        originalFocusNext = null;
    }
    if (originalFocusPrev) {
        orca.nav.focusPrev = originalFocusPrev;
        originalFocusPrev = null;
    }
    
    // 清理设置监听
    if (unsubscribeSettings) {
        unsubscribeSettings();
        unsubscribeSettings = null;
    }
    
    // 安全注销命令（即使可能未注册）
    try {
        orca.commands.unregisterCommand('tabsman.clearData');
    } catch (e) { /* 忽略错误 */ }
    
    orca.commands.unregisterCommand('tabsman.goToNextTab');
    orca.commands.unregisterCommand('tabsman.goToPreviousTab');
    orca.commands.unregisterCommand('tabsman.toggleSidebarTabsman');
    orca.themes.removeCSSResources(pluginName);
    
    console.log(`${pluginName} 已卸载`);
}


// 导出插件接口
export {
    load,
    unload
};
