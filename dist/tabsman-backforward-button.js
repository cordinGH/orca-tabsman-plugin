import * as TabsmanCore from './tabsman-core.js';
import * as Utils  from "./tabsman-utils.js";

let orcaBackButton = document.querySelector('.orca-button.orca-headbar-back');
let orcaForwardButton = document.querySelector('.orca-button.orca-headbar-back+.orca-button');
let backButton = orcaBackButton.cloneNode(true);
let forwardButton = orcaForwardButton.cloneNode(true);
let headbar = document.getElementById('headbar');
let currentPopup = null;

// 历史菜单
let backForwardMenu = null


/**
 * 获取当前 activePanel 对应活跃 tab 的历史栈信息
 * @param {'back'|'forward'} stackType
 * @returns {number} 对应历史记录条数
 */
function getHistoryCount(stackType) {
    const activeTabs = TabsmanCore.getActiveTabs();
    const tab = activeTabs?.[orca.state.activePanel];
    if (!tab) return { count: 0 };

    if (stackType === 'back') {
        // backStack 长度 - 1，因为栈顶是当前访问
        return Math.max(0, tab.backStack.length - 1);
    } else {
        return tab.forwardStack.length;
    }
}


/**
 * 启动后退前进按钮模块
 * @returns {Promise<void>}
 */
function startbackforwardbutton() {
    backButton.disabled = false;
    forwardButton.disabled = false;
    
    orcaBackButton.replaceWith(backButton);
    orcaForwardButton.replaceWith(forwardButton);
    
    // 右键触发历史菜单
    backButton.addEventListener('contextmenu', handleHistoryButtonRightClick);
    forwardButton.addEventListener('contextmenu', handleHistoryButtonRightClick);
    
    // 左键触发前进后退
    backButton.addEventListener('click', handleBackButtonLeftClick);
    forwardButton.addEventListener('click', handleForwardButtonLeftClick);

    // 悬停 tooltip
    // backButton.onmouseenter = () => Utils.showTooltip(backButton, `右键查看历史<span class="orca-tooltip-shortcut">当前${getHistoryCount('back')}</span>`)
    backButton.onmouseenter = () => Utils.showTooltip(backButton, `右键查看历史 | 当前${getHistoryCount('back')}`)
    backButton.onmouseleave = () => Utils.hideTooltip()
    // backButton.onmouseenter = () => Utils.showTooltip(backButton, `右键查看历史<span class="orca-tooltip-shortcut">当前${getHistoryCount('forward')}</span>`)
    forwardButton.onmouseenter = () => Utils.showTooltip(forwardButton, `右键查看历史 | 当前${getHistoryCount('forward')}`)
    forwardButton.onmouseleave = () => Utils.hideTooltip()

    // 注册历史条目容器
    if (!backForwardMenu) {
        backForwardMenu = document.createElement('div')
        backForwardMenu.className = 'orca-menu plugin-tabsman-history-menu'
    }
}


/**
 * 停止后退前进按钮模块
 * @returns {void}
 */
function stopbackforwardbutton() {
    // 移除按钮的事件监听器
    backButton.removeEventListener('contextmenu', handleHistoryButtonRightClick);
    forwardButton.removeEventListener('contextmenu', handleHistoryButtonRightClick);
    backButton.removeEventListener('click', handleBackButtonLeftClick);
    forwardButton.removeEventListener('click', handleForwardButtonLeftClick);

    // 恢复官方的原始按钮
    backButton.replaceWith(orcaBackButton);
    forwardButton.replaceWith(orcaForwardButton);
}


// ———————————————————————————————————————————————————————按钮左键事件———————————————————————————————————————————————————————


/**
 * 处理后退按钮左键点击事件
 */
function handleBackButtonLeftClick(e) {
    orca.commands.invokeCommand('core.goBack');
}

/**
 * 处理前进按钮左键点击事件
 */
function handleForwardButtonLeftClick(e) {
    orca.commands.invokeCommand('core.goForward');
}


// ———————————————————————————————————————————————————————退出菜单事件———————————————————————————————————————————————————————

/**
 * 处理关闭弹窗事件（ESC键或点击）
 */
async function handleClosePopup(e) {
    if (!currentPopup)  return

    // 如果是键盘事件，检查是否为ESC键
    let needClose = false
    if (e.type === 'keydown' && e.key === 'Escape') {
        needClose = true
    }
    
    // 如果点击的元素包含data-tabsman-backforward-block-id属性，执行特定逻辑
    if (e.type === 'pointerdown'){
        needClose = true

        const target = e.target.closest('.plugin-tabsman-history-item')
        if (target) {
            const index = target.getAttribute('data-tabsman-history-item-index')
            let view = target.getAttribute('data-tabsman-history-item-view')
            const stackItem = stackItemArrary[index]

            if (view === "block") {
                const {blockId} = stackItem.viewArgs
                const block = await orca.invokeBackend("get-block", blockId)
                if (!block) {
                    orca.notify("info",`[tabsman] 目标块${blockId}已删除，现重定向为今日日志`)
                    const date = new Date(new Date().toDateString())
                    Object.assign(stackItem, {icon: 'ti ti-calendar-smile', name: date.toDateString(), view: "journal", viewArgs: {date}})
                }
            }

            orca.nav.goTo(stackItem.view, stackItem.viewArgs)
        }
    }

    // 关闭弹窗
    if (needClose) {
        await Utils.closePopupwithAnimation(currentPopup)
        currentPopup = null;
        // 移除关闭弹窗事件监听器
        document.removeEventListener('keydown', handleClosePopup);
        document.removeEventListener('pointerdown', handleClosePopup);
        document.body.classList.remove('orca-popup-pointer-logic')
        headbar.classList.remove('plugin-tabsman-popup-open')
    }
}


// ———————————————————————————————————————————————————————按钮右键事件———————————————————————————————————————————————————————

/**
 * 处理后退前进按钮右键点击事件
 */
async function handleHistoryButtonRightClick(e) {
    // 右键打开历史时先隐藏 tooltip
    Utils.hideTooltip();
    
    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
    }

    const stackType = backButton.contains(e.target)? "back" : "forward"
    let stack = stackType === 'back' ? TabsmanCore.getActiveTabs()[orca.state.activePanel].backStack : TabsmanCore.getActiveTabs()[orca.state.activePanel].forwardStack;
    // 创建弹窗
    let popupEle = Utils.createDomWithClass('div', 'orca-popup plugin-tabsman-history-popup', headbar)
    popupEle.setAttribute('contenteditable', 'false');
    Object.assign(popupEle.style, { zIndex: '399', transformOrigin: 'left top' });
    popupEle.appendChild(await createBackForwardMenu([...stack], stackType));
    
    // 定位弹窗到按钮下方
    const buttonEle = stackType === 'back' ? backButton : forwardButton;
    Utils.setPopupPosition(popupEle, buttonEle)
    document.body.classList.add('orca-popup-pointer-logic')
    headbar.classList.add('plugin-tabsman-popup-open')
    
    // 保存当前弹窗引用
    currentPopup = popupEle;

    document.addEventListener('keydown', handleClosePopup);
    document.addEventListener('pointerdown', handleClosePopup);
}


/**
 * 创建后退前进菜单
 * @param {Array} stackArrary - 栈数组
 * @param {string} stackType - 栈类型 ('back' 或 'forward')
 * @returns {Promise<HTMLElement>} 返回菜单元素
 */
let stackItemArrary = []
async function createBackForwardMenu(stackArrary, stackType) {
    // 重置菜单
    backForwardMenu.textContent = ''
    backForwardMenu.style.cssText = ''
    stackItemArrary.length = 0

    if ((stackType === 'back' && stackArrary.length <= 1) ||  (stackType === 'forward' && stackArrary.length == 0)){
        backForwardMenu.textContent = `暂无${stackType === 'back' ? '后退' : '前进'}历史`
        Object.assign(backForwardMenu.style, {color: "var(--orca-color-gray-5)", textAlign: "center"})
        return backForwardMenu;
    }

    // 获取栈，如果是后退栈，先弹出栈顶元素（当前块）
    let stack = stackType === 'back' ? stackArrary.slice(0, -1) : stackArrary;
    stackItemArrary = [...stack]

    if (stackType === 'back') stackItemArrary.reverse()

    // 创建历史记录的条目项
    for (let i = 0; i < stackItemArrary.length; i++) {
        let stackItemInfo = stackItemArrary[i];
        let menuItem = createMenuItem(stackItemInfo, i);
        backForwardMenu.appendChild(menuItem); // 添加到菜单中
    }

    return backForwardMenu;
}


/**
 * 创建后退前进条目项
 * @param {Object} stackItemInfo - 栈项信息
 * @param {Number} index - item编号
 * @returns {HTMLElement} 返回菜单项元素
 */
function createMenuItem(stackItemInfo, index) {

    // 创建 orca-menu-text（item容器）
    const item = document.createElement('div');
    item.className = 'orca-menu-text plugin-tabsman-history-item';
    item.setAttribute('data-tabsman-history-item-index', index);
    item.setAttribute('data-tabsman-history-item-view', stackItemInfo.view);
    
    // 创建图标
    const icon = Utils.createDomWithClass("i", `${stackItemInfo.icon} orca-menu-text-icon orca-menu-text-pre`, item)

    // 创建 orca-menu-text-text（内容元素）
    const textText = Utils.createDomWithClass("div", 'orca-menu-text-text', item)
    textText.innerText = stackItemInfo.name;
    Object.assign(textText.style, {fontFamily: 'var(--orca-fontfamily-code)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '20em'})

    return item;
}

export { startbackforwardbutton, stopbackforwardbutton };