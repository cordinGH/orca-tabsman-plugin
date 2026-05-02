// Orca Tabsman Plugin - UI外壳模块
// 负责创建和注入tabsman侧边栏的UI外壳

import * as Utils from "./tabsman-utils.js";

/**
 * Orca本体的 DOM 元素引用集合
 * @type {{
 *   sidebarTabs: HTMLElement | null,
 *   sidebarTabOptions: HTMLElement | null,
 *   app: HTMLElement | null
 * }}
 * @property {HTMLElement | null} sidebarTabs - 侧边栏内容容器元素
 * @property {HTMLElement | null} sidebarTabOptions - 侧边栏选项元素
 * @property {HTMLElement | null} app - 应用根容器元素 (body > #app)
 */
let orcaEl = null

/**
 * Tabsman 插件UI外壳，包含侧边栏选项及其内容容器
 * @type {{
 *   optionEl: HTMLElement,
 *   contentEl: HTMLElement
 * }}
 * @property {HTMLElement} optionEl - 侧边栏选项按钮（.orca-segmented-item.plugin-tabsman-tab-option）
 * @property {HTMLElement} contentEl - 可隐藏的内容容器（.orca-hideable），内部包含tabsman根容器，plugin-tabsman-container
 */
let tabsmanShell = null;


// 命令的侧边栏目标状态
const targetStateByCommand = {
    'core.sidebar.goFavorites': 'favorites',
    'core.sidebar.goTags':      'tags',
    'core.sidebar.goPages':     'pages'
}

// 命令拦截注册列表
let unregisterList = []

/**
 * 创建tabsman外壳元素
 */
function setTabsmanShell() {

    // 可隐藏容器，对齐原生侧边栏结构
    const hideableContainer = document.createElement('div');
    hideableContainer.className = 'orca-hideable';

    // tabs栏根容器，.plugin-tabsman-container
    // 借用orca-favorites-list样式，元素的样式性质类似。
    const tabsmanContainer = Utils.createDomWithClass("div", 'plugin-tabsman-container orca-favorites-list', hideableContainer)
    
    // tab面板组组容器，.plugin-tabsman-tabs
    // 借用orca-favorites-items样式，元素的样式性质类似。
    const tabsmanTabs = Utils.createDomWithClass("div", 'plugin-tabsman-tabs orca-favorites-items', tabsmanContainer)

    // Tabs选项栏
    const optionEl = document.createElement('div');
    optionEl.className = 'orca-segmented-item plugin-tabsman-tab-option'
    optionEl.textContent = 'Tabs'

    tabsmanShell = {
        optionEl,
        contentEl: hideableContainer,
        tabsmanTabsEl: tabsmanContainer
    }
}


/**
 * 注入标签页管理器外壳，包括创建和注入基本UI外壳
 * @returns {{ optionEl: HTMLElement, contentEl: HTMLElement }} tabsman 外壳引用
 */
export function injectTabsmanShell() {
    orcaEl = {
        sidebarTabs: document.querySelector('.orca-sidebar-tabs'),
        sidebarTabOptions: document.querySelector('.orca-sidebar-tab-options'),
        app: document.querySelector("body>#app")
    }

    setTabsmanShell()

    // 注入到侧边栏内容区和选项卡区
    orcaEl.sidebarTabs.prepend(tabsmanShell.contentEl)
    orcaEl.sidebarTabOptions.append(tabsmanShell.optionEl)

    // 注册选项卡点击监听
    orcaEl.sidebarTabOptions.addEventListener('click', handleOptionsClick)

    // 拦截处理侧边栏命令
    unregisterList = interceptOrcaSidebarCommands()

    return tabsmanShell;
}


/**
 * 清理所有注入的标签页管理器外壳
 * @returns {void}
 */
export function cleanupTabsmanShell() {
    
    for (const [command, handler] of unregisterList) {
        orca.commands.unregisterBeforeCommand(command, handler)
    }
    unregisterList.length = 0
    
    orcaEl.sidebarTabOptions.removeEventListener('click', handleOptionsClick)

    tabsmanShell.contentEl.remove()
    tabsmanShell.optionEl.remove()

    tabsmanShell = null
    orcaEl = null
}


function handleOptionsClick(e) {
    const optionEl = e.target.closest('.orca-segmented-item')
    if (!optionEl) return

    if (optionEl.classList.contains('plugin-tabsman-tab-option')) {
        // 点击tabsman的选项卡时，如果本就处于选中，则不执行操作，反之则切换tabsman选项卡为选中样式
        if (__isTabsmanSelected()) return
        __addTabsmanSelected()
    } else {
        // 点击其他选项卡时，如果tabsman选项卡未选中，则不执行操作，反之则移除tabsman选项卡选中样式
        if (!__isTabsmanSelected()) return
        __removeTabsmanSelected()
    }
}

/**
 * 拦截处理侧边栏命令，返回一个注销列表
 * @returns 命令注册列表
 */
function interceptOrcaSidebarCommands() {
    
    const handleCommand = (commandState) => {
        // 没选中则正常执行
        if (!__isTabsmanSelected()) return true

        // 清除tabsman选中，清除后当前就在目标，且侧边栏是展开的则无需操作
        __removeTabsmanSelected()
        if (orca.state.sidebarTab === commandState && !orcaEl.app.classList.contains('sidebar-closed')) return false
        
        return true
    }
    
    const unregisterList = []
    for (const [command, targetState] of Object.entries(targetStateByCommand)) {
        const handler = () => handleCommand(targetState)
        unregisterList.push([command, handler])
        orca.commands.registerBeforeCommand(command, handler)
    }

    return unregisterList

}

function __isTabsmanSelected() {
    return orcaEl.sidebarTabOptions.classList.contains('plugin-tabsman-selected')
}


function __addTabsmanSelected() {
    orcaEl.sidebarTabOptions.classList.add('plugin-tabsman-selected')
    tabsmanShell.optionEl.classList.add('orca-selected')
}

function __removeTabsmanSelected() {
    orcaEl.sidebarTabOptions.classList.remove('plugin-tabsman-selected')
    tabsmanShell.optionEl.classList.remove('orca-selected')   
}