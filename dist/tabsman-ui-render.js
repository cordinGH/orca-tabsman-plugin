// Orca Tabsman Plugin - UI渲染模块
// 负责标签页列表的显示和实时更新

// 创建命名空间对象，提供更直观的API
import * as TabsmanCore from './tabsman-core.js';
import * as Persistence from './tabsman-persistence.js';
import { injectTabsmanShell, cleanupTabsmanShell } from './tabsman-ui-container.js';
import * as Utils from "./tabsman-utils.js";


/** @type {HTMLElement} - 标签页容器元素*/
let tabsmanTabsEle = null;

/** @type {boolean} - 启用tab预览 */
let enableTabPreview;

/** @type {Object} - 标签页缓存对象*/
let allTabEle = null

/**
 * 面板组缓存对象
 * 键为面板ID（panelId），值为对应的面板组 DOM 元素
 * @type {Object.<string, HTMLElement>}
 */
let allPanelGroupEle = null

let pluginDockpanelUnSubscribe = null;
let dockedPanelIdUnSubscribe = null;
let pluginDockPanel = null; // 只绑定检测到启用的目标插件，以消除多个插件版本时的数据误修改。
let pluginDockPanelReady = false
let lastDockPanelId = null;

let rendering = false;

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
    const isFavoriteBlock = Persistence.getTabArray("favorite").find(favoriteTab => favoriteTab.currentBlockId.toString() === tab.currentBlockId.toString())
    if (isFavoriteBlock) isFavorite = true;

    // ⭐️⭐️⭐️借用fav-item-item样式，性质是相同的。
    // plugin-tabsman-item-item为了适配tune-theme
    const tabElement = document.createElement('div')
    tabElement.className = 'plugin-tabsman-tab-item plugin-tabsman-item-item orca-fav-item-item';
    tabElement.setAttribute('data-tabsman-tab-id', tab.id);
    tabElement.setAttribute('data-tabsman-panel-id', panelId);
    tabElement.setAttribute('draggable', 'true');

    // 置顶图标
    const pinIcon = Utils.createDomWithClass("i", `plugin-tabsman-tab-pin ti ${tab.isPinned ? 'ti-pinned-filled' : 'ti-pinned'}`, tabElement)
    pinIcon.onmouseenter = () => Utils.showTooltip(pinIcon, tab.isPinned ? '点击取消置顶' : '点击置顶')
    pinIcon.onmouseleave = () => Utils.hideTooltip()

    // 块图标
    // ⭐️⭐️⭐️借用fav-item-icon样式，性质是相同的。
    const blockIcon = Utils.createDomWithClass("i", `plugin-tabsman-tab-icon orca-fav-item-icon orca-fav-item-icon-font ${tab.currentIcon} ${isFavorite ? 'plugin-tabsman-tab-favorite' : ''}`, tabElement)
    blockIcon.setAttribute('data-tabsman-tab-id', tab.id);
    blockIcon.setAttribute('data-tabsman-panel-id', panelId);
    blockIcon.onmouseenter = () => Utils.showTooltip(blockIcon, isFavorite ? '点击取消收藏' : '点击收藏该标签页')
    blockIcon.onmouseleave = () => Utils.hideTooltip()

    // 标签页标题
    // ⭐️⭐️⭐️借用fav-item-label样式，性质是相同的。
    const title = Utils.createDomWithClass("div", 'plugin-tabsman-tab-title orca-fav-item-label', tabElement)
    title.textContent = tab.name || `标签页name为空 ${tab.id}`;

    // 关闭按钮
    // ⭐️⭐️⭐️借用fav-item-menu样式，性质是相同的。
    const closeBtn = Utils.createDomWithClass("i", 'plugin-tabsman-tab-close ti ti-x orca-fav-item-menu', tabElement)
    closeBtn.setAttribute('data-tabsman-tab-id', tab.id);
    closeBtn.setAttribute('data-tabsman-panel-id', panelId);

    panelGroupEle.appendChild(tabElement)

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
 * @param {HTMLElement} panelGroupEle - 需要append进去的面板组元素
 * @returns {Object} 返回包含DOM元素和子元素引用的对象
 */
function createPanelItemElement(panelId, panelGroupEle) {

    // ⭐️⭐️⭐️借用fav-item-item样式，性质是相同的。
    // plugin-tabsman-item-item为了适配tune-theme
    const panelItemElement = document.createElement('div')
    panelItemElement.className = 'plugin-tabsman-panel-item plugin-tabsman-item-item orca-fav-item-item'
    panelItemElement.setAttribute('data-tabsman-panel-id', panelId);

    // 折叠图标
    // ⭐️⭐️⭐️借用fav-item-icon样式，性质类似性质类似性质类似（需要微调）。
    const collapseIcon = Utils.createDomWithClass("i", 'plugin-tabsman-panel-collapse-icon orca-fav-item-icon orca-fav-item-icon-font', panelItemElement)
    const dockedPanelId = pluginDockPanelReady ? window.pluginDockpanel.panel.id : ""
    if (panelId !== dockedPanelId) {
        // collapseIcon.className += ' ti ti-chevron-down';
        collapseIcon.className += ' ti ti-point-filled';
    } else {
        collapseIcon.className += ' ti ti-picture-in-picture-top-filled';
        collapseIcon.style.color = "var(--orca-color-primary-5)"
    } 

    // 面板标题
    // ⭐️⭐️⭐️借用fav-item-label样式，性质是相同的。
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

    // 创建新标签页按钮
    // ⭐️⭐️⭐️借用fav-item-menu样式，性质是相同的。
    const newTabButton = Utils.createDomWithClass("i", 'plugin-tabsman-panel-new-tab ti ti-plus orca-fav-item-menu', panelItemElement)
    newTabButton.setAttribute('data-tabsman-panel-id', panelId);
    newTabButton.onmouseenter = () => Utils.showTooltip(newTabButton, '单击 或 Alt+单击')
    newTabButton.onmouseleave = () => Utils.hideTooltip()

    panelGroupEle.appendChild(panelItemElement)
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
            const dockedPanelId = pluginDockPanelReady ? window.pluginDockpanel.panel.id : ""
            if (dockedPanelId) {
                const toggleCase1 = panelId === dockedPanelId && window.pluginDockpanel.isCollapsed
                // const toggleCase2 = !panelId === dockedPanelId && !window.pluginDockpanel.isCollapsed
                // 还是await一下，确保状态更新完毕再切换标签页。
                if (toggleCase1) await orca.commands.invokeCommand("dockpanel.toggleDockedPanel")
            } 
            await TabsmanCore.switchTab(tabId)
            return;
        }
    }

    // 处理面板相关事件
    if (target.closest('.plugin-tabsman-panel-item')) {
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
    // 防止重复渲染
    if (rendering) return;

    rendering = true;

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
    rendering = false;
}

// 关闭面板，轻量渲染
function __renderClosePanel(panelId) {
    const panelGroupEle = allPanelGroupEle[panelId]
    // 不重复清理
    if (!panelGroupEle) return;
    panelGroupEle.remove()

    Object.values(allTabEle).forEach((tabEle)=>{
        if (tabEle.element.dataset.tabsmanPanelId === panelId) {
            delete allTabEle[tabEle.element.dataset.tabsmanTabId]
        }
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

        // 生成面板标题与标签页元素
        createPanelItemElement(panelId, panelGroup);
        const tab = panelTabs[0]
        const tabElement = createTabElement(tab, panelId, panelGroup);
        allTabEle[tabId] = tabElement;
        tabElement.element.classList.add('active-tab-item');

        // 插入到正确位置，如果目标面板不是末尾索引，则插入到后一个index的前面，反之则直接append
        const panelIdsInOrder = Utils.getPanelIdsInOrder()
        const tailIndex = panelIdsInOrder.length - 1 // 末尾索引
        const targetIndex = panelIdsInOrder.findIndex(item => item === panelId)
        const referenceIndex = targetIndex !== tailIndex ? targetIndex + 1 : -1
        if (referenceIndex !== -1) {
            const referencePanelGrop = allPanelGroupEle[panelIdsInOrder[referenceIndex]]
            referencePanelGrop.before(panelGroup)
        } else tabsmanTabsEle.appendChild(panelGroup)

        return
    }

    const tabElement = createTabElement(tab, panelId, panelGroup);
    allTabEle[tab.id] = tabElement;
}

// pin住时更新整个面板，轻量渲染
function __renderPin(panelId){
    const fragment = document.createDocumentFragment();
    const newPanelGroupEle = __createOnePanelGroup(panelId, TabsmanCore.getOneSortedTabs(panelId))
    allPanelGroupEle[panelId].replaceWith(newPanelGroupEle)
    allPanelGroupEle[panelId].remove()
    allPanelGroupEle[panelId] = newPanelGroupEle
}

// 创建单个group并返回
function __createOnePanelGroup(panelId, panelTabs) {
    // 创建面板分组容器
    const panelGroup = document.createElement("div")
    panelGroup.className = 'plugin-tabsman-panel-group orca-fav-item'
    panelGroup.setAttribute('data-tabsman-panel-id', panelId);
    
    // 创建面板标题项
    createPanelItemElement(panelId, panelGroup);
    
    // 将该面板的标签页并加入面板分组容器
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

// update更新单个标签页，轻量渲染
// currentTab => 需要被处理的标签页
function __renderUpdate (tab) {
    const {id, panelId} = tab

    const tabElement = allTabEle[id].element
    const panelGroupEle = allPanelGroupEle[panelId]

    const newTab = createTabElement(tab, panelId, panelGroupEle)
    const newTabElement = newTab.element

    tabElement.classList.contains('active-tab-item') && newTabElement.classList.add('active-tab-item');

    allTabEle[id] = newTab
    tabElement.replaceWith(newTabElement)
    tabElement.remove()
}

// delete轻量渲染
// currentTab => 当前活跃的tab，pre是被删除的tab
function __renderDelete (currentTab, previousTab) {
    allTabEle[currentTab.id].element.classList.add('active-tab-item');
    allTabEle[previousTab.id].element.remove()
    delete allTabEle[previousTab.id]
}

// switch轻量渲染
function __renderSwitch (currentTab, previousTab) {
    allTabEle[previousTab.id].element.classList.remove('active-tab-item');
    allTabEle[currentTab.id].element.classList.add('active-tab-item');
}

// 全部渲染
function __renderAll() {
    // 清空现有内容
    tabsmanTabsEle.innerHTML = '';
    allTabEle = {}
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
    try {
        // 确保容器存在，如果不存在则创建
        const result = injectTabsmanShell();
        if (!result) {
            console.error('tabsmanUI外壳注入失败');
            return false;
        }

        enableTabPreview = orca.state.plugins[pluginName]?.settings.enableTabPreview
        
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
        // 检查是否已加载
        checkPluginDockpanelReady()
        pluginDockpanelUnSubscribe = window.Valtio.subscribe(
            orca.state.plugins,
            Utils.debounce(checkPluginDockpanelReady, 100) // 100ms延迟检查，确保对象构建完毕。
        )

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
    if (pluginDockpanelUnSubscribe) {
        pluginDockpanelUnSubscribe();
        pluginDockpanelUnSubscribe = null;
    }
    closeSyncDockpanelId()


    allTabEle = null;
    allPanelGroupEle = null;
    tabsmanTabsEle = null;
    lastDockPanelId = null;
}

// 导出模块接口
export {
    startTabsRender,
    stopTabsRender,
    renderTabsByPanel
};


// ———————————————————————————————————————— 联动停靠面板插件 ————————————————————————————————————————————————

/**
 * 检查停靠面板插件
 */ 
function checkPluginDockpanelReady() {

    // 扫描
    const pluginInfoArray = Object.values(orca.state.plugins)
    for (const pluginInfo of pluginInfoArray) {

        // 不存在该shcema说明本次不是目标插件（前提是插件关闭不清空设置）
        if (!pluginInfo.schema?.pluginDockPanelDefaultBlockId) continue;
        
        // 但用户可能不止安装了一个版本，因此有必要保存一下启用的插件。
        if (!pluginDockPanel && pluginInfo?.enabled) {
            pluginDockPanel = pluginInfo;
            setSyncDockPanelId()
            break;
        } else if (pluginDockPanel && !pluginInfo?.enabled) {
            closeSyncDockpanelId()
            pluginDockPanel = null
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
    // pluginDockPanelReady = false
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
    // const dockedPanelId = pluginDockPanelReady ? window.pluginDockpanel.panel.id : ""
    // return panelTitles.get(panelId) || (panelId === dockedPanelId ? "停靠面板" : "面板 " + panelId);
    return panelTitles.get(panelId) || "面板 " + panelId;
}