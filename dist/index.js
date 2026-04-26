// Orca Tabsman Plugin - 插件入口
// 负责启动核心功能和UI注入

import { start, destroy, switchToNextTab, switchToPreviousTab, switchPreviousActiveTab, openWorkspace } from './tabsman-core.js';
import { startTabsRender, stopTabsRender, renderTabsByPanel } from './tabsman-ui-render.js';
import { startRecentlyClosed, stopRecentlyClosed } from './tabsman-recently-closed.js';
import { startbackforwardbutton, stopbackforwardbutton } from './tabsman-backforward-button.js';

let pluginName;

// 取消订阅
let unsubscribeSettings = null;

// 存储原始导航 API 函数
let navOriginalFn = null

// 组件元素的classlist
// 注册开关侧边Tabs栏命令
let sidebarTabOptionsClassList = null
let tabOptionClassList = null
let appClassList = null

let commands = null

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
        await orca.plugins.clearData("tabsman")
        await orca.plugins.clearData("tabsman-update")
        await orca.plugins.clearData("tabsman-workspace")
        await orca.plugins.clearData("tabsman-workspace-scroll")
        await orca.plugins.clearData("tabsman-last-workspace")
        
        orca.notify("success", "[tabsman] 持久化数据已清除，请CTRL+R刷新生效");
    } catch (error) {
        orca.notify("error", `[tabsman] 清除数据失败: ${error.message}`);
    }
}

// 注册tabsman命令
function registerTabsmanCommand(){

    commands = [
        {
            name: "tabsman.switchToPreviousTab",
            fn: switchToPreviousTab,
            description: '[tabsman] 切换到上一个标签页'
        },
        {
            name: "tabsman.switchToNextTab",
            fn: switchToNextTab,
            description: '[tabsman] 切换到下一个标签页'
        },
        {
            name: 'tabsman.switchPreviousActiveTab',
            async fn() {
                const success = await switchPreviousActiveTab(orca.state.activePanel)
                if (!success) orca.notify("info", "[tabsman] 当前还没有访问过其他标签页")   
            },
            description: '[tabsman] 切换到上一次访问的标签页'
        },
        {
            name: 'tabsman.toggleSidebarTabsman',
            fn () {
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
            description: '[tabsman] 开启/关闭显示侧边Tabs栏'
        },
        {
            name: 'tabsman.createTodayJournalTab',
            fn () {
                const activePanel = document.querySelector('.plugin-tabsman-panel-group-active');
                window.pluginTabsman.createTodayJournalTab(activePanel.dataset.tabsmanPanelId)
            },
            description: '[tabsman] 在新标签页打开今日日志'
        },
        {
            name: 'tabsman.quickNoteByFoucs',
            fn () {
                const activePanel = document.querySelector('.plugin-tabsman-panel-group-active');
                window.pluginTabsman.createQuickNoteTab(activePanel.dataset.tabsmanPanelId)
            },
            description: '[tabsman] 在今日日志中快速记录（聚焦打开新Tab）'
        },
        {
            name: 'tabsman.reopenClosedTabsInOrder',
            fn: window.pluginTabsman.reopenClosedTabsInOrder,
            description: '[tabsman] 重新打开刚才关闭的标签页（按照关闭顺序）'
        }
    ]

    commands.forEach(({name,fn,description}) => orca.commands.registerCommand(name, fn, description))

    // 选择性注册清空数据的命令
    if (orca.state.plugins[pluginName]?.settings?.enableClearData) {
        orca.commands.registerCommand(
            'tabsman.clearData',
            clearAllData,
            "[tabsman] 清空持久化数据"
        );
    }

    // 订阅处理清理命令是否启用的设置变更
    unsubscribeSettings = window.Valtio.subscribe(orca.state.plugins[pluginName], () => {
        const enableClearData = orca.state.plugins[pluginName].settings?.enableClearData;
        if (enableClearData === false) {
            orca.commands.unregisterCommand('tabsman.clearData');
        } else if (enableClearData === true) {
            orca.commands.registerCommand(
                'tabsman.clearData',
                clearAllData,
                "[tabsman]清空持久化数据"
            );
            // orca.notify("success", "[tabsman] 清空持久化数据命令已启用");
        }
    });
}

// 移除命令
function unregisterTabsmanCommand() {

    commands.forEach(({name}) => orca.commands.unregisterCommand(name))
    
    // 安全注销命令（即使可能未注册）
    try {
        orca.commands.unregisterCommand('tabsman.clearData');
    } catch (e) { }
    
    // 取消对清理命令启用状态的订阅
    if (unsubscribeSettings) {
        unsubscribeSettings();
        unsubscribeSettings = null;
    }
    
    commands = null
}


// 更新活跃面板样式
function updateActivePanelStyle () {
    // 移除所有活跃样式
    let activePanel = document.querySelector('.plugin-tabsman-panel-group-active');
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
        "switchFocusTo": null // 悬浮预览、全局搜索，都会调用该函数
    }
    Object.keys(navOriginalFn).forEach(fnName => {
        // 保存原函数
        navOriginalFn[fnName] = orca.nav[fnName]

        // 包装处理
        orca.nav[fnName] = function(panelId) {
            navOriginalFn[fnName].call(this, panelId)

            // 虎鲸官方特殊视图是以_开头的，例如'_globalSearch','_reference'。
            // 切换视图不应该改变活跃面板的样式标记，否则可能会导致在这些视图中，无法正确创建Tabs。
            if (!orca.state.activePanel.startsWith("_")) updateActivePanelStyle();
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
        },
        maxRecentlyClosedTabs: {
            label: "最近关闭标签页的最大保留条数",
            description: "指定最近关闭标签页的最大保留条数，超出后， 最早的关闭记录将被丢弃。若设置<2或>10的值，将等同于默认值5。",
            type: "number",
            defaultValue: 5
        },
        enableQuickNotePrefix: {
            label: "快速记录时追加日期前缀",
            description: "启用后，快速记录时会自动追加今日日期前缀，如260331。命令面板搜索tabsman可找到快速记录命令。",
            type: "boolean",
            defaultValue: true
        },
        prefixString: {
            label: "快速记录日期前缀的起始字符",
            description: "自定义快速记录日期前缀的起始字符，例如下方填写date，则前缀最终为date260331。支持emoji字符。",
            type: "string",
            defaultValue: "date"
        },
        enableAutoFoldQuickNotes: {
            label: "快速记录时自动折叠",
            description: "启用后，每当创建新的快速记录时，会自动折叠上一次快速记录，以保持日志页的整洁",
            type: "boolean",
            defaultValue: true
        },
        enableTabPreview: {
            label: "标签页悬浮预览（需重启生效）",
            description: "启用后，按住 Alt 悬停在标签页上时，会显示预览窗口",
            type: "boolean",
            defaultValue: true
        },
        restoreLastWorkspace: {
            label: "启动时自动恢复上次工作区",
            description: "启用后，每当进入该库时，将自动打开上次关闭前所在的工作区。若上次未进入任何工作区，则不做处理。",
            type: "boolean",
            defaultValue: true
        },
    });


    // 启动标签页渲染    
    await startTabsRender(pluginName);
    // 启动标签页系统，传递UI更新回调
    await start(renderTabsByPanel, pluginName);
    
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
