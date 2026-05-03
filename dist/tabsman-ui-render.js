// Orca Tabsman Plugin - UI渲染模块
// 负责标签页列表的显示和实时更新

// 创建命名空间对象，提供更直观的API
import * as TabsmanCore from './tabsman-core.js';
import * as Persistence from './tabsman-persistence.js';
import { injectTabsmanShell, cleanupTabsmanShell } from './tabsman-ui-container.js';
import * as Utils from "./tabsman-utils.js";


// 设置选项
/** @type {boolean} - 启用tab预览 */
let enableTabPreview;

/* ——————————————————————————————————————— tabsman DOM元素 ——————————————————————————————————————————————— */
/** @type {HTMLElement} - 标签页容器元素*/
let tabsmanTabsEle = null;
/** @type {Object} - 标签页缓存对象*/
let allTabItems = null
/**
 * 面板组缓存对象
 * 键为面板ID（panelId），值为对应的面板组 DOM 元素
 * @type {Object.<string, HTMLElement>}
 */
let allPanelGroupEle = null
// 面板自定义标题（本次会话有效）
const panelTitles = new Map();

/* —————————————————————————————————————  dockpanel插件联动 ————————————————————————————————————— */
let pluginDockpanelUnSubscribe = null;
let dockedPanelIdUnSubscribe = null;
let dockpanelInfo = null; // 只绑定检测到启用的目标插件，以消除多个插件版本时的数据误修改。
// let pluginDockPanelReady = false
let lastDockPanelId = null;

/* ————————————————————————拖拽标签页或者拖拽创建标签页所需的数据 ————————————————————————————————————— */
/** @type {HTMLDivElement} - 存放从drag-start中行为监听到的orca-block元素 */
let orcaBlockfromDrag;

/**
 * @type {object} - dragState 拖拽状态记录
 * @property {string | null} tabId - 正在拖拽的标签页 ID
 * @property {HTMLDivElement | null} targetPanelGroupEl - 当前拖入的面板组元素
 */
let dragState = {
    tabId: null,
    targetPanelGroupEl: null,
}

/* —————————————————————————————————————————————————————————————————————————————————— */


/**
 * 创建单个标签页的DOM元素
 * @param {Object} tab - 标签页数据
 * @param {string} panelId - 面板ID
 * @returns {Object} 返回包含DOM元素和子元素引用的对象
 */
function createTabItem(tab, panelId) {
    // 判断是否为收藏块
    let isFavorite = false;
    const isFavoriteBlock = Persistence.getTabArray("favorite").find(favoriteTab => favoriteTab.currentBlockId.toString() === tab.currentBlockId.toString())
    if (isFavoriteBlock) isFavorite = true;

    // 标签页条目容器，plugin-tabsman-item-item是为了适配tune-theme
    // 借用orca-favorites-items样式，元素样式性质类似。
    const tabElement = document.createElement('div')
    tabElement.className = 'plugin-tabsman-tab-item orca-fav-item-item plugin-tabsman-item-item';
    tabElement.setAttribute('data-tabsman-tab-id', tab.id);
    tabElement.setAttribute('data-tabsman-panel-id', panelId);
    tabElement.draggable = true;

    // 置顶图标
    const pinIcon = Utils.createDomWithClass("i", `plugin-tabsman-tab-pin ti ${tab.isPinned ? 'ti-pinned-filled' : 'ti-pinned'}`, tabElement)
    pinIcon.onmouseenter = () => Utils.showTooltip(pinIcon, tab.isPinned ? '点击取消置顶' : '点击置顶')
    pinIcon.onmouseleave = () => Utils.hideTooltip()

    // 块图标，借用fav-item-icon样式，元素样式性质类似。
    const blockIcon = Utils.createDomWithClass("i", `plugin-tabsman-tab-icon orca-fav-item-icon orca-fav-item-icon-font ${tab.currentIcon} ${isFavorite ? 'plugin-tabsman-tab-favorite' : ''}`, tabElement)
    blockIcon.setAttribute('data-tabsman-tab-id', tab.id);
    blockIcon.setAttribute('data-tabsman-panel-id', panelId);
    blockIcon.onmouseenter = () => Utils.showTooltip(blockIcon, isFavorite ? '点击取消收藏' : '点击收藏该标签页')
    blockIcon.onmouseleave = () => Utils.hideTooltip()

    // 标签页标题，借用fav-item-label样式，元素样式性质类似。
    const title = Utils.createDomWithClass("div", 'plugin-tabsman-tab-title orca-fav-item-label', tabElement)
    title.textContent = tab.name || `标签页name为空 ${tab.id}`;

    // 关闭按钮，借用fav-item-menu样式，元素样式性质类似。
    const closeBtn = Utils.createDomWithClass("i", 'plugin-tabsman-tab-close ti ti-x orca-fav-item-menu', tabElement)
    closeBtn.setAttribute('data-tabsman-tab-id', tab.id);
    closeBtn.setAttribute('data-tabsman-panel-id', panelId);

    // panelGroupEle.appendChild(tabElement)

    enableTabPreview && Utils.enableBlockPreview(tabElement, tab,closeBtn)

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
 * @returns {Object} 返回包含DOM元素和子元素引用的对象
 */
function createPanelItem(panelId) {

    // 面板条目容器，plugin-tabsman-item-item是为了适配tune-theme
    // 借用orca-favorites-items样式，元素样式性质类似。
    const panelItemElement = document.createElement('div')
    panelItemElement.className = 'plugin-tabsman-panel-item plugin-tabsman-item-item orca-fav-item-item'
    panelItemElement.setAttribute('data-tabsman-panel-id', panelId);

    // 折叠图标，借用fav-item-icon样式，元素样式性质类似。
    const collapseIcon = Utils.createDomWithClass("i", 'plugin-tabsman-panel-collapse-icon orca-fav-item-icon orca-fav-item-icon-font', panelItemElement)
    const dockedPanelId = dockpanelInfo ? window.pluginDockpanel.panel.id : ""
    if (panelId !== dockedPanelId) {
        // collapseIcon.className += ' ti ti-chevron-down';
        collapseIcon.className += ' ti ti-point-filled';
    } else {
        collapseIcon.className += ' ti ti-picture-in-picture-top-filled';
        collapseIcon.style.color = "var(--orca-color-primary-5)"
    } 

    // 面板标题，借用fav-item-label样式，元素样式性质类似。
    const title = Utils.createDomWithClass("div", 'plugin-tabsman-panel-title orca-fav-item-label', panelItemElement)
    title.setAttribute("contenteditable", "true");
    // 加载保存的标题，如果没有则使用默认标题
    const savedTitle = getPanelTitle(panelId);
    title.textContent = savedTitle;
    title.onmouseenter = () => Utils.showTooltip(title, "点击可修改名称，修改后按enter生效")
    title.onmouseleave = () => Utils.hideTooltip()
    
    if (panelId === dockedPanelId) {
        title.style.color = "var(--orca-color-primary-5)"
    }

    // 创建新标签页按钮，借用fav-item-menu样式，元素样式性质类似。
    const newTabButton = Utils.createDomWithClass("i", 'plugin-tabsman-panel-new-tab ti ti-plus orca-fav-item-menu', panelItemElement)
    newTabButton.setAttribute('data-tabsman-panel-id', panelId);
    newTabButton.onmouseenter = () => Utils.showTooltip(newTabButton, '单击 或 Alt+单击')
    newTabButton.onmouseleave = () => Utils.hideTooltip()

    // panelGroupEle.appendChild(panelItemElement)
    // 返回包含DOM元素和子元素引用的对象
    return {
        element: panelItemElement,
        collapseIcon: collapseIcon,
        title: title,
        newTabButton: newTabButton
    };
}


/**
 * 处理tabsman容器点击事件
 * @param {MouseEvent} e 
 * @returns 
 */
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
            const isFavorite = target.classList.contains('plugin-tabsman-tab-favorite');
            isFavorite ? await Persistence.removeAndSaveTab(tab, "favorite") : await Persistence.addAndSaveTab(tab, "favorite");
            renderTabsByPanel();
        } else {
            // 存在停靠面板则先联动dockpanel插件=>切换停靠面板的折叠状态。
            const dockedPanelId = dockpanelInfo ? window.pluginDockpanel.panel.id : ""
            if (dockedPanelId) {
                const toggleCase1 = panelId === dockedPanelId && window.pluginDockpanel.isCollapsed
                // const toggleCase2 = !panelId === dockedPanelId && !window.pluginDockpanel.isCollapsed
                // 还是await一下，确保状态更新完毕再切换标签页。
                if (toggleCase1) await orca.commands.invokeCommand("dockpanel.toggleDockedPanel")
            } 
            await TabsmanCore.switchTab(tabId)
            return;
        }

    } else if (target.closest('.plugin-tabsman-panel-item')) {
        // 处理面板相关事件
        if (target.classList.contains('plugin-tabsman-panel-new-tab')) {
            const panelId = target.getAttribute('data-tabsman-panel-id')
            window.event.altKey ? window.pluginTabsman.createQuickNoteTab(panelId) : window.pluginTabsman.createTodayJournalTab(panelId);
        }
        // else if (target.classList.contains('plugin-tabsman-panel-collapse-icon')) {
        //     // TODO: 实现折叠/展开功能（暂时感觉没啥用）
        // }
    }
}


// 按面板分组渲染所有标签页列表
function renderTabsByPanel({type, currentTab, previousTab, panelId, moveInfo} = {}) {

    if (!tabsmanTabsEle) {
        orca.notify("info", '[tabsman] 标签页容器元素不存在，无法渲染标签页列表');
        return;
    }

    switch (type) {
        case "delete":
            __renderDelete(currentTab, previousTab);break;
        case "switch":
            __renderSwitch(currentTab, previousTab);break;
        case "update":
            __renderUpdate(currentTab);break;
        case "OnPanel":
        case "pin":
            __renderPin(panelId);break;
        case "create":
            __renderCreate(currentTab);break;
        case "closePanel":
            __renderClosePanel(panelId);break;
        case 'move':
            __renderMove(moveInfo);break;
        default:
            __renderAll();break;
    }
    
    // 确保当前面板的active样式
    const activePanelGroup = allPanelGroupEle[orca.state.activePanel]
    if (activePanelGroup) {
        activePanelGroup.classList.add('plugin-tabsman-panel-group-active');
    }

}

// 关闭面板，轻量渲染
function __renderClosePanel(panelId) {
    const panelGroupEle = allPanelGroupEle[panelId]
    if (!panelGroupEle) return;
    panelGroupEle.remove()

    // 清除数据缓存
    Object.values(allTabItems).forEach((tabItem)=>{
        const elDataset = tabItem.element.dataset
        if (elDataset.tabsmanPanelId === panelId) delete allTabItems[elDataset.tabsmanTabId];
    })

    delete allPanelGroupEle[panelId]
}

// // 交换面板DOM顺序（携带动画效果），上和左，代表before，下和右代表after
function __renderMove(moveInfo) {
    const {from, to, dir} = moveInfo
    const fromEle = allPanelGroupEle[from]
    const toEle = allPanelGroupEle[to]

    // First
    const firstRects = new Map();
    Object.values(allPanelGroupEle).forEach(el => firstRects.set(el, el.getBoundingClientRect()));

    // Last：DOM 交换
    if (dir === "left" || dir === "top") {
        toEle.before(fromEle)
    } else if (dir === "right" || dir === "bottom") {
        toEle.after(fromEle)
    }

    // Invert + Play
    Object.values(allPanelGroupEle).forEach(el => {
        const dy = firstRects.get(el).top - el.getBoundingClientRect().top;
        if (dy === 0) return;
        el.animate(
            [{ transform: `translateY(${dy}px)` }, { transform: `translateY(0)` }],
            { duration: 200, easing: 'ease-out' }
        );
    });
}

// 创建tab时渲染，轻量渲染
function __renderCreate(tab) {
    const {id: tabId, panelId} = tab
    let panelGroup = allPanelGroupEle[panelId]
    
    // 该case是在第一次创建面板时构建初始tab。也因此panelTabs期望长度应当是1
    if (!panelGroup) {

        // 准备该面板的DOM元素
        const panelTabs = TabsmanCore.getOneSortedTabs(panelId)
        if (panelTabs.length !== 1) {
            orca.notify("info", "[tabsman] __renderCreate期望值为1，请检查逻辑是否有误")
            return
        }

        // 面板容器
        panelGroup = document.createElement('div')
        panelGroup.className = 'plugin-tabsman-panel-group orca-fav-item'
        panelGroup.setAttribute('data-tabsman-panel-id', panelId);
        allPanelGroupEle[panelId] = panelGroup

        // 生成面板标题与标签页
        const panelItemEl = createPanelItem(panelId).element;
        panelGroup.append(panelItemEl)
        const tabItem = createTabItem(panelTabs[0], panelId);
        allTabItems[tabId] = tabItem;
        const tabItemEl = tabItem.element
        tabItemEl.classList.add('active-tab-item');
        panelGroup.append(tabItemEl)

        // 插入到正确位置，如果目标面板不是末尾索引，则插入到后一个index的前面，反之则直接append
        const panelIdsInOrder = Utils.getPanelIdsInOrder()
        const tailIndex = panelIdsInOrder.length - 1 // 末尾索引
        const targetIndex = panelIdsInOrder.findIndex(item => item === panelId)
        const referenceIndex = targetIndex !== tailIndex ? targetIndex + 1 : -1
        if (referenceIndex !== -1) {
            const referencePanelGrop = allPanelGroupEle[panelIdsInOrder[referenceIndex]]
            referencePanelGrop.before(panelGroup)
        } else tabsmanTabsEle.append(panelGroup)

        return
    }

    const tabItem = createTabItem(tab, panelId);
    allTabItems[tab.id] = tabItem;
    panelGroup.append(tabItem.element)
}

// pin住时更新整个面板，轻量渲染
function __renderPin(panelId){
    const newPanelGroupEle = __createOnePanelGroup(panelId, TabsmanCore.getOneSortedTabs(panelId))
    allPanelGroupEle[panelId].replaceWith(newPanelGroupEle)
    // allPanelGroupEle[panelId].remove()
    allPanelGroupEle[panelId] = newPanelGroupEle
}

// 创建单个group并返回
function __createOnePanelGroup(panelId, tabs) {
    // 创建面板分组容器
    const panelGroup = document.createElement("div")
    panelGroup.className = 'plugin-tabsman-panel-group orca-fav-item'
    panelGroup.setAttribute('data-tabsman-panel-id', panelId);
    
    // 创建面板标题项
    const panelItemEl = createPanelItem(panelId).element;
    panelGroup.append(panelItemEl)
    
    // 将该面板的标签页加入面板分组容器
    const tabItemEls = tabs.map(tab => {
        const tabItem = createTabItem(tab, panelId);
        allTabItems[tab.id] = tabItem;
        return tabItem.element
    })
    panelGroup.append(...tabItemEls)
    
    // 副作用：标记活跃Tab
    const activeTabId = TabsmanCore.getActiveTabs()?.[panelId]?.id;
    const activeTabItem = allTabItems[activeTabId]
    if (activeTabItem) activeTabItem.element.classList.add('active-tab-item');

    return panelGroup
}

// update更新单个标签页，轻量渲染
// currentTab => 需要被处理的标签页
function __renderUpdate (tab) {
    const {id, panelId} = tab

    const tabItemEl = allTabItems[id].element

    const newTabItem = createTabItem(tab, panelId)
    const newTabItemEl = newTabItem.element

    if (tabItemEl.classList.contains('active-tab-item')) newTabItemEl.classList.add('active-tab-item');

    allTabItems[id] = newTabItem
    tabItemEl.replaceWith(newTabItemEl)
}

// delete轻量渲染
// currentTab => 当前活跃的tab，pre是被删除的tab
function __renderDelete (currentTab, previousTab) {
    allTabItems[currentTab.id].element.classList.add('active-tab-item');
    allTabItems[previousTab.id].element.remove()
    delete allTabItems[previousTab.id]
}

// switch轻量渲染
function __renderSwitch (currentTab, previousTab) {
    allTabItems[previousTab.id].element.classList.remove('active-tab-item');
    allTabItems[currentTab.id].element.classList.add('active-tab-item');
}

// 全部渲染
function __renderAll() {
    // 清空现有内容
    tabsmanTabsEle.innerHTML = '';
    allTabItems = {}
    allPanelGroupEle = {}

    // 获取所有面板的排序标签页列表
    const allSortedTabs = TabsmanCore.getAllSortedTabs();

    if (!allSortedTabs || allSortedTabs.size < 1) return;

    // 一次性插入
    const fragment = document.createDocumentFragment();

    // 根据面板顺序渲染，以适应一些特殊的面板拖拽事件。
    for (const panelId of Utils.getPanelIdsInOrder()) {
        const panelTabs = TabsmanCore.getOneSortedTabs(panelId)
        if (panelTabs.length === 0) {
            orca.notify("info", '[tabsman] 存在疏漏，请检查算法，')
            continue;
        }
        const panelGroup = __createOnePanelGroup(panelId, panelTabs)
        allPanelGroupEle[panelId] = panelGroup
        fragment.appendChild(panelGroup)
    }
    
    tabsmanTabsEle.appendChild(fragment);
}


/**
 * 启动标签页渲染系统
 * @param {string} pluginName - 插件名
 * @returns {Promise<boolean>} 返回启动是否成功
 */
function startTabsRender(pluginName) {

    enableTabPreview = orca.state.plugins[pluginName]?.settings.enableTabPreview
    
    // 注册外壳并绑定标签页容器
    tabsmanTabsEle = injectTabsmanShell().tabsmanTabsEl

    // 注册事件监听
    tabsmanTabsEle.addEventListener('click', handleTabsmanClick);
    setUpTabDragAndDrop();
    tabsmanTabsEle.addEventListener('focusout', handlePanelTitleFocusout);
    tabsmanTabsEle.addEventListener('keydown', handlePanelTitleEnter);
    tabsmanTabsEle.addEventListener('input', handlePanelTitleInput);

    // 订阅插件列表变化，为停靠面板的id绑定/解绑
    checkPluginDockpanelReady() // 手动一次，预防已经加载成功
    pluginDockpanelUnSubscribe = window.Valtio.subscribe(
        orca.state.plugins,
        checkPluginDockpanelReady
    )

    allTabItems = {};
    allPanelGroupEle = {};
    return true;
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
    
    // 清理dockpanel订阅
    if (pluginDockpanelUnSubscribe) {
        pluginDockpanelUnSubscribe();
        pluginDockpanelUnSubscribe = null;
    }
    closeSyncDockpanelId()
    dockpanelInfo = null
    lastDockPanelId = null;

    // 清理拖拽数据
    dragState = {}
    orcaBlockfromDrag = null

    // 清理tabs DOM元素
    allTabItems = null;
    allPanelGroupEle = null;
    tabsmanTabsEle = null;
    panelTitles.clear();
}

// 导出模块接口
export {
    startTabsRender,
    stopTabsRender,
    renderTabsByPanel
};


// ———————————————————————————————————————— 联动停靠面板插件 ————————————————————————————————————————————————

const checkPluginDockpanelReady = Utils.debounce(__checkPluginDockpanelReady, 100)
/**
 * 检查停靠面板插件
 */ 
function __checkPluginDockpanelReady() {

    // 扫描
    const pluginInfoArray = Object.values(orca.state.plugins)
    for (const pluginInfo of pluginInfoArray) {

        // 如果记录了启用的目标插件，则只处理目标插件的关闭变更        
        if (dockpanelInfo && pluginInfo !== dockpanelInfo) continue;

        // 不存在该shcema说明本次不是目标插件（前提是插件关闭不清空设置）
        if (!pluginInfo.schema?.pluginDockPanelDefaultBlockId) continue;
        
        // 但用户可能不止安装了一个版本，因此有必要保存一下启用的插件。
        if (!dockpanelInfo && pluginInfo?.enabled) {
            dockpanelInfo = pluginInfo;
            setSyncDockPanelId()
            break;
        } else if (dockpanelInfo && !dockpanelInfo.enabled) {
            closeSyncDockpanelId()
            dockpanelInfo = null
            break;
        }
    }
}

/**
 * 样式上同步panelId的变更
 */
function setSyncDockPanelId() {
    dockedPanelIdUnSubscribe = window.Valtio.subscribe( window.pluginDockpanel.panel,
        () => setTimeout(() => {
            // 发生变化则移除掉旧的样式
            removeDockPanelStyle()

            // 如果新值是null，则不处理，否则旧更新样式
            const newDockedPanelId = window.pluginDockpanel.panel.id
            if (!newDockedPanelId) return;

            lastDockPanelId = newDockedPanelId
            const newTargetIcon = allPanelGroupEle[newDockedPanelId].querySelector('.plugin-tabsman-panel-collapse-icon')
            const newTargetTitle = allPanelGroupEle[newDockedPanelId].querySelector('.plugin-tabsman-panel-title')
            newTargetIcon.classList.remove('ti-point-filled')
            newTargetIcon.classList.add('ti-picture-in-picture-top-filled')
            newTargetIcon.style.color = "var(--orca-color-primary-5)"
            newTargetTitle.style.color = "var(--orca-color-primary-5)"
        }, 0) 
    )
}

/**
 * dockpanel插件已关闭，停止掉panelId的同步
 */
function closeSyncDockpanelId() {
    if (dockedPanelIdUnSubscribe) {
        dockedPanelIdUnSubscribe()
        dockedPanelIdUnSubscribe = null
    }
    removeDockPanelStyle()
}

/**
 * 移除掉当前的dockpanel面板样式
 */
function removeDockPanelStyle() {
    const dockPanelIcon = allPanelGroupEle[lastDockPanelId]?.querySelector('.plugin-tabsman-panel-collapse-icon')
    if (dockPanelIcon) {
        const title = allPanelGroupEle[lastDockPanelId].querySelector('.plugin-tabsman-panel-title')
        dockPanelIcon.classList.remove('ti-picture-in-picture-top-filled')
        dockPanelIcon.classList.add('ti-point-filled')
        dockPanelIcon.style.color = ''
        title.style.color = ''
    }
    lastDockPanelId = null;
}

// ————————————————————————————————————————————————————————————————————————————————————————


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

    // 拖拽创建标签页
    document.addEventListener('dragstart', recordBlockId)
    tabsmanTabsEle.addEventListener('drop', createTabByDrop)
}

function cleanupTabDragAndDrop() {
    tabsmanTabsEle.removeEventListener('dragstart', handleTabDragStart);
    tabsmanTabsEle.removeEventListener('dragover', handleTabDragOver);
    tabsmanTabsEle.removeEventListener('dragenter', handleTabDragEnter);
    tabsmanTabsEle.removeEventListener('drop', handleTabDrop);
    tabsmanTabsEle.removeEventListener('dragend', handleTabDragEnd);

    document.removeEventListener('dragstart', recordBlockId)
    tabsmanTabsEle.removeEventListener('drop', createTabByDrop)
}


function recordBlockId(e) {
    orcaBlockfromDrag = e.target.closest(".orca-block.orca-container")
}
function createTabByDrop(e) {
    e.preventDefault();

    // 不存在目标块则不执行
    if (!orcaBlockfromDrag) return

    //获取放置的面板
    const panelGroupEl = e.target.closest('.plugin-tabsman-panel-group');
    if (!panelGroupEl) return
    const panelId = panelGroupEl.dataset.tabsmanPanelId

    // 获取拖拽id
    let {type, id: blockId} = orcaBlockfromDrag.dataset
    blockId = parseInt(blockId)

    // 生成创建参数
    let initHistoryInfo;
    if (type === 'journal') {
        const block = orca.state.blocks[blockId]
        const {date} = block.properties.find(prop => prop.name === '_repr').value
        initHistoryInfo = {view: 'journal', viewArgs: {date}}
    } else {
        initHistoryInfo = {view: 'block', viewArgs: {blockId}}
    }

    TabsmanCore.createTab({currentBlockId: blockId, panelId, initHistoryInfo}).finally(()=>orcaBlockfromDrag = null)
}

function handleTabDragStart(e) {
    const tabElement = e.target.closest('.plugin-tabsman-tab-item');
    if (!tabElement) return;
    dragState.tabId = tabElement.getAttribute('data-tabsman-tab-id');
    dragState.targetPanelGroupEl = e.target.closest('.plugin-tabsman-panel-group');
    dragState.targetPanelGroupEl.classList.add('plugin-tabsman-panel-group-drag-over');
}

/** 标签页拖入事件处理函数 */
function handleTabDragEnter(e) {
    // 忽略外部拖拽
    if (!dragState.tabId) return

    // 切换到新目标则触发变更
    const newPanelGroupEl = e.target.closest('.plugin-tabsman-panel-group');
    if (newPanelGroupEl && newPanelGroupEl !== dragState.targetPanelGroupEl) {
        dragState.targetPanelGroupEl.classList.remove('plugin-tabsman-panel-group-drag-over');
        newPanelGroupEl.classList.add('plugin-tabsman-panel-group-drag-over');
        dragState.targetPanelGroupEl = newPanelGroupEl;
    }
}

// 持续阻止默认的禁止拖放，但没有tab拖拽则保持禁止
function handleTabDragOver(e) {
    if (!dragState.tabId && !orcaBlockfromDrag) return
    e.preventDefault();
}

// 处理drop事件，移动标签页到目标面板。
function handleTabDrop(e) {
    e.preventDefault();
    const {tabId, targetPanelGroupEl} = dragState
    if (!tabId || !targetPanelGroupEl) return
    const newPanelId = dragState.targetPanelGroupEl.getAttribute('data-tabsman-panel-id')
    targetPanelGroupEl.classList.remove('plugin-tabsman-panel-group-drag-over');
    TabsmanCore.moveTabToPanel(tabId, newPanelId)
    .then((success) => success && orca.nav.switchFocusTo(newPanelId))
    .catch((err) => {
        orca.notify("error", `[tabsman] 移动标签页失败，请Ctrl R刷新`);
        console.log('[tabsman] 报错：', err);
    })
    // 清理数据，因为当dom元素成功拖走时，不会触发end事件，反之则会继续触发end
    dragState.tabId = null;
    dragState.targetPanelGroupEl = null;
}

// end清理
function handleTabDragEnd(e) {
    if (dragState.targetPanelGroupEl) {
        dragState.targetPanelGroupEl.classList.remove('plugin-tabsman-panel-group-drag-over');
    }
    dragState.tabId = null;
    dragState.targetPanelGroupEl = null;
}

// ========== 面板标题编辑处理函数 ==========

/**
 * 处理面板标题输入事件（实时监听）
 * @param {Event} e - 事件对象
 * @param {string} panelId - 面板ID
 */
function handlePanelTitleInput(e) {
    if (!e.target.classList.contains('plugin-tabsman-panel-title')) return;
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
    if (!e.target.classList.contains('plugin-tabsman-panel-title')) return;
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
    if (!e.target.classList.contains('plugin-tabsman-panel-title')) return;
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
    // const dockedPanelId = pluginDockPanelReady ? window.pluginDockpanel.panel.id : ""
    // return panelTitles.get(panelId) || (panelId === dockedPanelId ? "停靠面板" : "面板 " + panelId);
    return panelTitles.get(panelId) || "面板 " + panelId;
}