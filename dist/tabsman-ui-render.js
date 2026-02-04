// Orca Tabsman Plugin - UI渲染模块
// 负责标签页列表的显示和实时更新

// 创建命名空间对象，提供更直观的API
import * as TabsmanCore from './tabsman-core.js';
import * as Persistence from './tabsman-persistence.js';
import { injectTabsmanShell, cleanupTabsmanShell } from './tabsman-ui-container.js';


// 标签页容器元素
let tabsmanTabsEle = null;

let allTabEle = null
let allPanelGroupEle = null

let pluginDockpanelUnSubscribe = null;
let dockedPanelIdUnSubscribe = null;
let pluginDockPanelReady = false

let rendering = false;

const createDomWithClass = window.pluginTabsman.createDomWithClass


/**
 * 通用退订函数
 * @param {Function|null} unsubscribeFn - 退订函数
 * @returns {null} 返回 null 用于重新赋值
 */
function cleanupSubscription(unsubscribeFn) {
    if (unsubscribeFn) {
        unsubscribeFn();
    }
    return null;
}


/**
 * 创建单个标签页的DOM元素
 * @param {Object} tab - 标签页数据
 * @param {string} panelId - 面板ID
 * @param {HTMLElement} panelGroupEle - 需要append进去的面板组元素
 * @returns {Object} 返回包含DOM元素和子元素引用的对象
 */
function createTabElement(tab, panelId, panelGroupEle) {
    // 判断是否为收藏块
    let isFavorite = false;
    if (Persistence.getFavoriteBlockArray().findIndex(item => item.id.toString() === tab.currentBlockId.toString()) !== -1) {
        isFavorite = true;
    }

    // ⭐️⭐️⭐️借用fav-item-item样式，性质是相同的。
    // plugin-tabsman-item-item为了适配tune-theme
    const tabElement = createDomWithClass("div", "plugin-tabsman-tab-item plugin-tabsman-item-item orca-fav-item-item", panelGroupEle)
    tabElement.className = 'plugin-tabsman-tab-item plugin-tabsman-item-item orca-fav-item-item';
    tabElement.setAttribute('data-tabsman-tab-id', tab.id);
    tabElement.setAttribute('data-tabsman-panel-id', panelId);
    tabElement.setAttribute('draggable', 'true');

    // 置顶图标
    const pinIcon = createDomWithClass("i", `plugin-tabsman-tab-pin ti ${tab.isPinned ? 'ti-pinned-filled' : 'ti-pinned'}`, tabElement)

    // 块图标
    // ⭐️⭐️⭐️借用fav-item-icon样式，性质是相同的。
    const blockIcon = createDomWithClass("i", `plugin-tabsman-tab-icon orca-fav-item-icon orca-fav-item-icon-font ${tab.currentIcon} ${isFavorite ? 'plugin-tabsman-tab-favorite' : ''}`, tabElement)
    blockIcon.setAttribute('data-tabsman-tab-id', tab.id);
    blockIcon.setAttribute('data-tabsman-panel-id', panelId);

    // 标签页标题
    // ⭐️⭐️⭐️借用fav-item-label样式，性质是相同的。
    const title = createDomWithClass("div", 'plugin-tabsman-tab-title orca-fav-item-label', tabElement)
    title.textContent = tab.name || `标签页 ${tab.id}`;

    // 关闭按钮
    // ⭐️⭐️⭐️借用fav-item-menu样式，性质是相同的。
    const closeBtn = createDomWithClass("i", 'plugin-tabsman-tab-close ti ti-x orca-fav-item-menu', tabElement)
    closeBtn.setAttribute('data-tabsman-tab-id', tab.id);
    closeBtn.setAttribute('data-tabsman-panel-id', panelId);

    // 返回包含DOM元素和子元素引用的对象
    return {
        element: tabElement,
        pinIcon: pinIcon,
        blockIcon: blockIcon,
        title: title,
        closeBtn: closeBtn
    };
}

/**
 * 创建单个面板item的DOM元素
 * @param {string} panelId - 面板ID
 * @param {HTMLElement} panelGroupEle - 需要append进去的面板组元素
 * @returns {Object} 返回包含DOM元素和子元素引用的对象
 */
function createPanelItemElement(panelId, panelGroupEle) {
    // ⭐️⭐️⭐️借用fav-item-item样式，性质是相同的。
    // plugin-tabsman-item-item为了适配tune-theme
    const panelItemElement = createDomWithClass("div", 'plugin-tabsman-panel-item plugin-tabsman-item-item orca-fav-item-item', panelGroupEle)
    panelItemElement.setAttribute('data-tabsman-panel-id', panelId);

    // 折叠图标
    // ⭐️⭐️⭐️借用fav-item-icon样式，性质类似性质类似性质类似（需要微调）。
    const collapseIcon = createDomWithClass("i", 'plugin-tabsman-panel-collapse-icon orca-fav-item-icon orca-fav-item-icon-font', panelItemElement)
    const dockedPanelId = pluginDockPanelReady ? window.pluginDockpanel.panel.id : ""
    if (panelId !== dockedPanelId) {
        collapseIcon.className += ' ti ti-chevron-down';
    } else {
        collapseIcon.className += ' ti ti-window-minimize';
        collapseIcon.style.color = "var(--orca-color-primary-5)"
    } 

    // 面板标题
    // ⭐️⭐️⭐️借用fav-item-label样式，性质是相同的。
    const title = createDomWithClass("div", 'plugin-tabsman-panel-title orca-fav-item-label', panelItemElement)
    title.setAttribute("contenteditable", "true");
    // 加载保存的标题，如果没有则使用默认标题
    const savedTitle = getPanelTitle(panelId);
    title.textContent = savedTitle;
    
    if (panelId === dockedPanelId) {
        title.style.color = "var(--orca-color-primary-5)"
    }

    // 创建新标签页按钮
    // ⭐️⭐️⭐️借用fav-item-menu样式，性质是相同的。
    const newTabButton = createDomWithClass("i", 'plugin-tabsman-panel-new-tab ti ti-plus orca-fav-item-menu', panelItemElement)
    newTabButton.setAttribute('data-tabsman-panel-id', panelId);

    // 返回包含DOM元素和子元素引用的对象
    return {
        element: panelItemElement,
        collapseIcon: collapseIcon,
        title: title,
        newTabButton: newTabButton
    };
}


// 处理tabsman容器点击事件
async function handleTabsmanClick(e) {
    const target = e.target
    const tabElement = target.closest('.plugin-tabsman-tab-item');

    // 处理tab的icon点击事件
    if (tabElement) {
        const tabId = tabElement.getAttribute('data-tabsman-tab-id');
        const panelId = tabElement.getAttribute('data-tabsman-panel-id');

        if (!tabId || !panelId) return;
        const tab = TabsmanCore.getTab(tabId);
        if (!tab) return;

        if (target.classList.contains('plugin-tabsman-tab-pin')) {
            tab.isPinned? await TabsmanCore.unpinTab(tabId) : await TabsmanCore.pinTab(tabId)
        } else if (target.classList.contains('plugin-tabsman-tab-close')) {
            await TabsmanCore.deleteTab(tabId);
        } else if (target.classList.contains('plugin-tabsman-tab-icon')) {
            // 点击块图标切换收藏状态
            const isFavorite = target.classList.toggle('plugin-tabsman-tab-favorite');
            isFavorite ? await Persistence.addAndSaveFavoriteBlock({id: tab.currentBlockId, icon: tab.currentIcon, title: tab.name}) : await Persistence.removeAndSaveFavoriteBlock(tab.currentBlockId);
            // renderTabsByPanel({type: "favorite", panelId});
            renderTabsByPanel();
        } else {
            // 存在停靠面板则先联动dockpanel插件=>切换停靠面板的折叠状态。
            const dockedPanelId = pluginDockPanelReady ? window.pluginDockpanel.panel.id : ""
            if (dockedPanelId) {
                const toggleCase1 = panelId === dockedPanelId && window.pluginDockpanel.isCollapsed
                // const toggleCase2 = !panelId === dockedPanelId && !window.pluginDockpanel.isCollapsed
                // 还是await一下，确保状态更新完毕再切换标签页。
                if (toggleCase1) await orca.commands.invokeCommand("dockpanel.toggleDockedPanel")
            } 
            TabsmanCore.switchTab(tabId)
            return;
        }
    }

    // 处理面板相关事件
    if (target.closest('.plugin-tabsman-panel-item')) {
        if (target.classList.contains('plugin-tabsman-panel-new-tab')) {
            const panelId = target.getAttribute('data-tabsman-panel-id')
            window.event.altKey ? window.pluginTabsman.createQuickNoteTab(panelId) : TabsmanCore.createTab({currentBlockId: -1, needSwitch: false, panelId});
        }
        // else if (target.classList.contains('plugin-tabsman-panel-collapse-icon')) {
        //     // TODO: 实现折叠/展开功能（暂时感觉没啥用）
        // }
    }
}


// 按面板分组渲染所有标签页列表
function renderTabsByPanel({type, currentTab, previousTab, panelId} = {}) {
    // 防止重复渲染
    if (rendering) return;

    rendering = true;

    if (!tabsmanTabsEle) {
        orca.notify("info", '[tabsman] 标签页容器元素不存在，无法渲染标签页列表');
        return;
    }

    switch (type) {
        case "delete":
            renderDelete(currentTab, previousTab);break;
        case "switch":
            renderSwitch(currentTab, previousTab);break;
        case "update":
            renderUpdate(currentTab);break;
        case "pin":
            renderPin(panelId);break;
        case "create":
            renderCreate(currentTab);break;
        case "closePanel":
            renderClosePanel(panelId);break;
        default:
            renderAll();break;
    }
    
    // 确保当前面板的active样式
    const activePanelGroup = allPanelGroupEle[orca.state.activePanel]
    if (activePanelGroup) {
        activePanelGroup.classList.add('plugin-tabsman-panel-group-active');
    }
    rendering = false;
}

// 关闭面板，轻量渲染
function renderClosePanel(panelId) {
    const panelGroupEle = allPanelGroupEle[panelId]
    
    // 不重复清理
    if (!panelGroupEle) return;

    panelGroupEle.remove()
    const tabIdSet = TabsmanCore.getTabIdSetByPanelId(panelId)
    for (const tabId of tabIdSet) {
        delete allTabEle[tabId]
    }

    delete allPanelGroupEle[panelId]
}

// 创建tab时渲染，轻量渲染
function renderCreate(tab) {
    const {id, panelId} = tab
    let panelGroup = allPanelGroupEle[panelId]
    if (!panelGroup) {
        const panelTabs = TabsmanCore.getOneSortedTabs(panelId)

        // 该case是在第一次创建面板时构建初始tab，因此panelTabs期望长度应当是1
        if (panelTabs.length !== 1) {
            orca.notify("info", "[tabsman] renderCreate期望值为1，请检查逻辑是否有误")
            return
        }

        panelGroup = createDomWithClass("div", 'plugin-tabsman-panel-group orca-fav-item', tabsmanTabsEle)
        panelGroup.setAttribute('data-tabsman-panel-id', panelId);
        allPanelGroupEle[panelId] = panelGroup

        // 创建面板标题项
        createPanelItemElement(panelId, panelGroup);
        const tab = panelTabs[0]

        // 渲染标签页并加入面板分组容器
        const tabElement = createTabElement(tab, panelId, panelGroup);
        allTabEle[tab.id] = tabElement;
        tabElement.element.classList.add('active-tab-item');
        
        return
    }

    const tabElement = createTabElement(tab, panelId, panelGroup);
    allTabEle[tab.id] = tabElement;
}

// pin住时更新整个面板，轻量渲染
function renderPin(panelId){
    const newPanelGroupEle = _renderOnePanelGroup(panelId, TabsmanCore.getOneSortedTabs(panelId))
    allPanelGroupEle[panelId].replaceWith(newPanelGroupEle)
    allPanelGroupEle[panelId].remove()
    allPanelGroupEle[panelId] = newPanelGroupEle
}

// 渲染单个group，返回渲染结果
function _renderOnePanelGroup(panelId, panelTabs) {
    // 创建面板分组容器
    const panelGroup = createDomWithClass("div", 'plugin-tabsman-panel-group orca-fav-item', tabsmanTabsEle)
    panelGroup.setAttribute('data-tabsman-panel-id', panelId);
    
    // 创建面板标题项
    createPanelItemElement(panelId, panelGroup);
    
    // 渲染该面板的标签页并加入面板分组容器
    for (const tab of panelTabs) {
        const tabElement = createTabElement(tab, panelId, panelGroup);
        allTabEle[tab.id] = tabElement;
        // 添加活跃状态样式并加入面板分组容器
        const activeTabs = TabsmanCore.getActiveTabs();
        if (activeTabs && activeTabs[panelId].id === tab.id) {
            tabElement.element.classList.add('active-tab-item');
        }
    }

    return panelGroup
}

// update更新单个标签页（活跃标签页），轻量渲染
// currentTab => 需要被处理的标签页
function renderUpdate (tab) {
    const {id, panelId} = tab

    const tabElement = allTabEle[id].element
    const panelGroupEle = allPanelGroupEle[panelId]

    const newTab = createTabElement(tab, panelId, panelGroupEle)
    const newTabElement = newTab.element

    newTabElement.classList.add('active-tab-item');
    allTabEle[id] = newTab
    tabElement.replaceWith(newTabElement)
    tabElement.remove()
}

// delete轻量渲染
// currentTab => 当前活跃的tab，pre是被删除的tab
function renderDelete (currentTab, previousTab) {
    allTabEle[currentTab.id].element.classList.add('active-tab-item');
    allTabEle[previousTab.id].element.remove()
    delete allTabEle[previousTab.id]
}

// switch轻量渲染
function renderSwitch (currentTab, previousTab) {
    allTabEle[previousTab.id].element.classList.remove('active-tab-item');
    allTabEle[currentTab.id].element.classList.add('active-tab-item');
}

// 全部渲染
function renderAll() {
    // 清空现有内容
    tabsmanTabsEle.innerHTML = '';
    allTabEle = {}
    allPanelGroupEle = {}

    // 获取所有面板的排序标签页列表
    const allSortedTabs = TabsmanCore.getAllSortedTabs();

    if (!allSortedTabs || allSortedTabs.size < 1) return;

    for (const [panelId, panelTabs] of allSortedTabs) {
        if (panelTabs.length === 0) continue;
        allPanelGroupEle[panelId] = _renderOnePanelGroup(panelId, panelTabs)
    }
}


/**
 * 启动标签页渲染系统
 * @returns {Promise<boolean>} 返回启动是否成功
 */
async function startTabsRender() {
    try {
        // 确保容器存在，如果不存在则创建
        const result = await injectTabsmanShell();
        if (!result) {
            console.error('tabsmanUI外壳注入失败');
            return false;
        }
        
        // 直接获取标签页容器元素
        tabsmanTabsEle = result.tabsmanTabsEl;
        if (!tabsmanTabsEle) {
            console.error('未找到tabsmanTabsEle');
            return false;
        }

        // 注册监听器
        tabsmanTabsEle.addEventListener('click', handleTabsmanClick);
        setUpTabDragAndDrop();
        tabsmanTabsEle.addEventListener('focusout', handlePanelTitleFocusout);
        tabsmanTabsEle.addEventListener('keydown', handlePanelTitleEnter);
        tabsmanTabsEle.addEventListener('input', handlePanelTitleInput);

        // 订阅插件列表变化，为停靠面板的id绑定订阅
        pluginDockpanelSubscribe()
        pluginDockpanelUnSubscribe = window.Valtio.subscribe(orca.state.plugins, () => pluginDockpanelSubscribe())
        if (pluginDockPanelReady) dockedPanelIdUnSubscribe = window.Valtio.subscribe(window.pluginDockpanel.panel,  () => renderTabsByPanel())

        allTabEle = {};
        allPanelGroupEle = {};
        return true;

    } catch (error) {
        console.error('标签页渲染系统启动失败:', error);
        return false;
    }
}

/**
 * 停止标签页渲染系统
 * @returns {void}
 */
function stopTabsRender() {
    tabsmanTabsEle.removeEventListener('click', handleTabsmanClick);
    cleanupTabDragAndDrop();
    tabsmanTabsEle.removeEventListener('focusout', handlePanelTitleFocusout);
    tabsmanTabsEle.removeEventListener('keydown', handlePanelTitleEnter);
    tabsmanTabsEle.removeEventListener('input', handlePanelTitleInput);
    
    // 清理注入的外壳（包含所有渲染元素）
    cleanupTabsmanShell();
    
    // 清理订阅
    cleanupSubscription(pluginDockpanelUnSubscribe);
    cleanupSubscription(dockedPanelIdUnSubscribe);
    allTabEle = null;
    allPanelGroupEle = null;
}

// 导出模块接口
export {
    startTabsRender,
    stopTabsRender,
    renderTabsByPanel
};


// 检查停靠面板插件
function pluginDockpanelSubscribe() {
    // 已就位不需要处理
    if (pluginDockPanelReady) return

    // 扫描
    const pluginInfoArray = Object.values(orca.state.plugins)
    for (const pluginInfo of pluginInfoArray) {

        if (!pluginInfo.settings) continue

        if (!Object.hasOwn(pluginInfo.settings, "pluginDockPanelDefaultBlockId")) continue
        
        // 先重置，防止用户关闭了停靠面板插件
        pluginDockPanelReady = false
        if (Object.hasOwn(pluginInfo, "module")) {
            pluginDockPanelReady = true
            break
        }
    }
}

/** ========== 标签页拖拽和放置事件处理函数 ========== */
/**
 * 设置标签页拖拽和放置事件
 * @returns {void}
 */
function setUpTabDragAndDrop() {
    tabsmanTabsEle.addEventListener('dragstart', handleTabDragStart);
    tabsmanTabsEle.addEventListener('dragover', handleTabDragOver);
    tabsmanTabsEle.addEventListener('dragenter', handleTabDragEnter);
    tabsmanTabsEle.addEventListener('drop', handleTabDrop);
    tabsmanTabsEle.addEventListener('dragend', handleTabDragEnd);
}

function cleanupTabDragAndDrop() {
    tabsmanTabsEle.removeEventListener('dragstart', handleTabDragStart);
    tabsmanTabsEle.removeEventListener('dragover', handleTabDragOver);
    tabsmanTabsEle.removeEventListener('dragenter', handleTabDragEnter);
    tabsmanTabsEle.removeEventListener('drop', handleTabDrop);
    tabsmanTabsEle.removeEventListener('dragend', handleTabDragEnd);
}

/** 标签页拖拽和放置事件处理函数 */
let dragTabId = null;
let panelGroupElement = null;
function handleTabDragStart(e) {
    const tabElement = e.target.closest('.plugin-tabsman-tab-item');
    if (tabElement) {
        dragTabId = tabElement.getAttribute('data-tabsman-tab-id');
        panelGroupElement = e.target.closest('.plugin-tabsman-panel-group');
        panelGroupElement.classList.add('plugin-tabsman-panel-group-drag-over');
    }
}

/** 标签页拖入事件处理函数 */
function handleTabDragEnter(e) {
    // 约束只有切到新的group时，才执行逻辑，避免重复执行。
    const newPanelElement = e.target.closest('.plugin-tabsman-panel-group');
    if (newPanelElement && newPanelElement !== panelGroupElement) {
        // 清理旧的group的样式
        panelGroupElement.classList.remove('plugin-tabsman-panel-group-drag-over');
        // 设置新的group的样式
        newPanelElement.classList.add('plugin-tabsman-panel-group-drag-over');
        panelGroupElement = newPanelElement;
    }
}

// 持续阻止默认行为，以支持drop事件。
function handleTabDragOver(e) {
    e.preventDefault();   
}

// await会导致返回一个promise从而导致end触发，以至于panelGroupElement提前变为null值
let isDroping = false
// 处理drop事件，移动标签页到目标面板。
async function handleTabDrop(e) {
    isDroping = true
    e.preventDefault();
    const newPanelId = panelGroupElement.getAttribute('data-tabsman-panel-id')
    await TabsmanCore.moveTabToPanel(dragTabId, newPanelId);
    orca.nav.switchFocusTo(newPanelId)
    // 清理数据，因为drop到可拖拽区域是不会触发end事件的。
    panelGroupElement.classList.remove('plugin-tabsman-panel-group-drag-over');
    panelGroupElement = null;
    dragTabId = null;
}

// 确保任何情况都清理，例如没有触发drop事件时，也清理。
async function handleTabDragEnd(e) {
    if (!isDroping && panelGroupElement) {
        panelGroupElement.classList.remove('plugin-tabsman-panel-group-drag-over');
        panelGroupElement = null;
        dragTabId = null;
    }
}

// ========== 面板标题编辑处理函数 ==========
// 内存中存储面板标题（本次会话有效）
const panelTitles = new Map();

/**
 * 处理面板标题输入事件（实时监听）
 * @param {Event} e - 事件对象
 * @param {string} panelId - 面板ID
 */
function handlePanelTitleInput(e) {
    if (!e.target.matches('.plugin-tabsman-panel-title')) return;
    const titleElement = e.target;
    const currentText = titleElement.textContent;

    if (currentText.length > 20) {
        titleElement.textContent = currentText.substring(0, 20);
        // 将光标移到末尾
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(titleElement);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }
}


/**
 * 处理面板标题回车事件
 * @param {Event} e - 事件对象
 */
function handlePanelTitleEnter(e) {
    if (!e.target.matches('.plugin-tabsman-panel-title')) return;
    const titleElement = e.target;
    const panelId = titleElement.parentElement.dataset.tabsmanPanelId;
    if (e.key === 'Enter') {
        e.preventDefault();
        const newTitle = titleElement.textContent.trim();
        newTitle? panelTitles.set(panelId, newTitle) : panelTitles.delete(panelId);
        titleElement.blur();
    }
}

/**
 * 处理面板标题失去焦点事件
 * @param {Event} e - 事件对象
 */
function handlePanelTitleFocusout(e) {
    if (!e.target.matches('.plugin-tabsman-panel-title')) return;
    const titleElement = e.target;
    const panelId = titleElement.parentElement.dataset.tabsmanPanelId;
    titleElement.textContent = getPanelTitle(panelId);
}


/**
 * 获取面板标题
 * @param {string} panelId - 面板ID
 * @returns {string} 面板标题
 */
function getPanelTitle(panelId) {
    // return panelTitles.get(panelId) || (panelId === dockedPanelId ? "停靠面板" : "面板 " + panelId.slice(0, 5));
    const dockedPanelId = pluginDockPanelReady ? window.pluginDockpanel.panel.id : ""
    return panelTitles.get(panelId) || (panelId === dockedPanelId ? "停靠面板" : "面板 " + panelId);
}