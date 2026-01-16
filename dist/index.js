// Orca Tabsman Plugin - 插件入口
// 负责启动核心功能和UI注入


import "./tabsman-utils.js";
import { start, destroy, switchToNextTab, switchToPreviousTab, switchPreviousActiveTab } from './tabsman-core.js';
import { startTabsRender, stopTabsRender, renderTabsByPanel } from './tabsman-ui-render.js';
import { startRecentlyClosed, stopRecentlyClosed } from './tabsman-recently-closed.js';
import { startbackforwardbutton, stopbackforwardbutton } from './tabsman-backforward-button.js';

let pluginName;

// 防重复执行标志，代表正在创建标签页
let isCreatingTab = false;

// 设置取消订阅
let unsubscribeSettings = null;

// 存储原始导航 API 函数
let navOriginalFn = null

// 组件元素的classlist
// 注册开关侧边Tabs栏命令
let sidebarTabOptionsClassList = null
let tabOptionClassList = null
let appClassList = null


function bindHtmlElement() {
    sidebarTabOptionsClassList = document.querySelector('.orca-sidebar-tab-options')?.classList;
    tabOptionClassList = document.querySelector('.plugin-tabsman-tab-option')?.classList;
    appClassList = document.body.querySelector(':scope > #app')?.classList;
}
function clearBindHtmlElement() {
    sidebarTabOptionsClassList = null
    tabOptionClassList = null
    appClassList = null
}

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

// 注册tabsman命令
function registerTabsmanCommand(){
    // 注册标签页导航命令
    orca.commands.registerCommand(
        'tabsman.goToNextTab',
        async () => {
            const success = await switchToNextTab();
            if (success) orca.notify("success", "[tabsman] 已切换到下一个标签页")
        },
        '[tabsman] Go to next tab'
    );
    orca.commands.registerCommand(
        'tabsman.goToPreviousTab',
        async () => {
            const success = await switchToPreviousTab();
            if (success) orca.notify("success", "[tabsman] 已切换到上一个标签页")
        },
        '[tabsman] Go to previous tab'
    );
    orca.commands.registerCommand(
        'tabsman.goToPreviousActiveTab',
        () => {
            const success = switchPreviousActiveTab(orca.state.activePanel)
            if (!success) orca.notify("info", "[tabsman] 其他标签页暂未访问过")
        },
        '[tabsman] Go to previous active tab'
    );
    
    // 注册开关侧边Tabs栏命令
    orca.commands.registerCommand(
        'tabsman.toggleSidebarTabsman',
        () => {
            if (appClassList.contains('sidebar-closed')) {
                orca.commands.invokeCommand('core.toggleSidebar');
                sidebarTabOptionsClassList.add('plugin-tabsman-selected');
                tabOptionClassList.add('orca-selected');
            } else {
                if (sidebarTabOptionsClassList.contains('plugin-tabsman-selected')) {
                    orca.commands.invokeCommand('core.toggleSidebar');
                } else {
                    sidebarTabOptionsClassList.add('plugin-tabsman-selected');
                    tabOptionClassList.add('orca-selected');
                }
            }
        },
        '[tabsman] 开启/关闭显示侧边Tabs栏'
    );

    // 注册清空数据的命令
    if (orca.state.plugins[pluginName]?.settings?.enableClearData) {
        orca.commands.registerCommand(
            'tabsman.clearData',
            clearAllData,
            "[tabsman] 清空持久化数据"
        );
    }

    // 订阅处理清理命令是否启用
    const tabsmanPlugin = orca.state.plugins[pluginName]
    unsubscribeSettings = window.Valtio.subscribe(tabsmanPlugin, () => {
        const enableClearData = tabsmanPlugin.settings?.enableClearData;
        if (enableClearData === false) {
            orca.commands.unregisterCommand('tabsman.clearData');
            orca.notify("success", "[tabsman] 清空持久化数据命令已禁用");
        } else if (enableClearData === true) {
            orca.commands.registerCommand(
                'tabsman.clearData',
                clearAllData,
                "[tabsman]清空持久化数据"
            );
            orca.notify("success", "[tabsman] 清空持久化数据命令已启用");
        }
    });
}

// 移除命令
function unregisterTabsmanCommand() {
    orca.commands.unregisterCommand('tabsman.goToNextTab');
    orca.commands.unregisterCommand('tabsman.goToPreviousTab');
    orca.commands.unregisterCommand('tabsman.toggleSidebarTabsman');

    // 安全注销命令（即使可能未注册）
    try {
        orca.commands.unregisterCommand('tabsman.clearData');
    } catch (e) { }

    // 取消对清理命令启用状态的订阅
    if (unsubscribeSettings) {
        unsubscribeSettings();
        unsubscribeSettings = null;
    }
}


// 更新活跃面板样式
function updateActivePanelStyle () {
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

// 处理活跃面板的更新
function startActivePanelUpdateHandle() {
    // 包装导航 API，使得每次切换面板都会变更.plugin-tabsman-panel-group-active元素
    navOriginalFn = {
        "focusNext": null,
        "focusPrev": null,
        "switchFocusTo": null
    }
    Object.keys(navOriginalFn).forEach(fnName => {
        // 保存原函数
        navOriginalFn[fnName] = orca.nav[fnName]

        // 包装处理
        orca.nav[fnName] = function(panelId) {
            navOriginalFn[fnName].call(this, panelId)
            if (orca.state.activePanel !== "_globalSearch") {
                updateActivePanelStyle();
            }
        }
    })

    // 为面板切换命令注册 after hooks
    orca.commands.registerAfterCommand('core.switchToNextPanel', updateActivePanelStyle);
    orca.commands.registerAfterCommand('core.switchToPreviousPanel', updateActivePanelStyle);
}

function stopActivePanelUpdateHandle() {
    Object.keys(navOriginalFn).forEach(fnName => {
        const fn = navOriginalFn[fnName]
        if (fn) orca.nav[fnName] = fn
    })

    orca.commands.unregisterAfterCommand('core.switchToNextPanel', updateActivePanelStyle);
    orca.commands.unregisterAfterCommand('core.switchToPreviousPanel', updateActivePanelStyle);
    navOriginalFn = null
}

/**
 * 插件加载
 * @param {string} name - 插件名称
 * @returns {Promise<void>}
 */
async function load(name) {
    window.pluginTabsman = {}

    pluginName = name;

    // 注入样式文件
    orca.themes.injectCSSResource(`${pluginName}/dist/tabsman-styles.css`, pluginName);
    
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
            defaultValue: false
        }
    });

    
    // 启动标签页渲染    
    await startTabsRender();
    // 启动标签页系统，传递UI更新回调
    await start(renderTabsByPanel);
    
    // 插件启动完成后，主动触发一次渲染通知
    renderTabsByPanel();
    
    // 绑定所需的html元素
    bindHtmlElement()
    
    // 检查设置，如果启用默认显示Tabs栏
    if (orca.state.plugins[pluginName]?.settings?.defaultTabOption) {
        sidebarTabOptionsClassList.add('plugin-tabsman-selected')
        tabOptionClassList.add('orca-selected')
    }
    // 注册命令
    registerTabsmanCommand()

    // 处理活跃面板更新（样式）
    startActivePanelUpdateHandle()
    
    // 启动最近关闭标签页模块
    startRecentlyClosed(renderTabsByPanel);
    
    // 启动前进后退按钮模块
    startbackforwardbutton();
}


/**
 * 插件卸载
 * @returns {Promise<void>}
 */
async function unload() {
    console.log(`=== ${pluginName} 卸载中 ===`);
    
    // 停止功能模块（先停止依赖模块）
    stopRecentlyClosed();
    stopbackforwardbutton();
    
    // 停止对当前面板更新的处理
    stopActivePanelUpdateHandle()
    
    // 命令注销
    unregisterTabsmanCommand()

    // 清空变量绑定
    clearBindHtmlElement()

    // 清理Core
    destroy();
    
    // 停止UI渲染
    stopTabsRender();

    orca.themes.removeCSSResources(pluginName);
    
    // 清理全局命名空间
    if (window.pluginTabsman) delete window.pluginTabsman

    console.log(`${pluginName} 已卸载`);
}


// 导出插件接口
export {
    load,
    unload
};
