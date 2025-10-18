import * as TabsmanCore from './tabsman-core.js';

let orcaBackButton = document.querySelector('.orca-button.orca-headbar-back');
let orcaForwardButton = document.querySelector('.orca-button.orca-headbar-back+.orca-button');
let backButton = orcaBackButton.cloneNode(true);
let forwardButton = orcaForwardButton.cloneNode(true);
let headbar = document.querySelector('#headbar');
let currentPopup = null;


/**
 * 启动后退前进按钮模块
 * @returns {Promise<void>}
 */
async function startbackforwardbutton() {
    backButton.disabled = false;
    forwardButton.disabled = false;
    
    orcaBackButton.replaceWith(backButton);
    orcaForwardButton.replaceWith(forwardButton);
    
    // 监听新创建的按钮（右键触发）
    backButton.addEventListener('contextmenu', handleBackButtonRightClick);
    forwardButton.addEventListener('contextmenu', handleForwardButtonRightClick);
    
    // 监听新创建的按钮（左键触发）
    backButton.addEventListener('click', handleBackButtonLeftClick);
    forwardButton.addEventListener('click', handleForwardButtonLeftClick);

    // 注册item点击跳转
    headbar.addEventListener('click', handleHeadbarLeftClick);
    
    // 注册全局关闭弹窗事件监听器
    document.addEventListener('keydown', handleClosePopup);
    document.addEventListener('click', handleClosePopup);
}


/**
 * 停止后退前进按钮模块
 * @returns {void}
 */
function stopbackforwardbutton() {
    // 移除新按钮的事件监听器
    backButton.removeEventListener('contextmenu', handleBackButtonRightClick);
    forwardButton.removeEventListener('contextmenu', handleForwardButtonRightClick);
    backButton.removeEventListener('click', handleBackButtonLeftClick);
    forwardButton.removeEventListener('click', handleForwardButtonLeftClick);
    
    // 移除headbar的事件监听器
    headbar.removeEventListener('click', handleHeadbarLeftClick);
    
    // 移除关闭弹窗事件监听器
    document.removeEventListener('keydown', handleClosePopup);
    document.removeEventListener('click', handleClosePopup);

    // 恢复原始按钮
    backButton.replaceWith(orcaBackButton);
    forwardButton.replaceWith(orcaForwardButton);
    
    // 清理引用
    headbar = null;
    backButton = null;
    forwardButton = null;
    currentPopup = null;
}



// ———————————————————————————————————————————————————————按钮左键事件———————————————————————————————————————————————————————


/**
 * 处理后退按钮左键点击事件
 * @param {Event} e - 事件对象
 * @returns {void}
 */
function handleBackButtonLeftClick(e) {
    orca.commands.invokeCommand('core.goBack');
}

/**
 * 处理前进按钮左键点击事件
 * @param {Event} e - 事件对象
 * @returns {void}
 */
function handleForwardButtonLeftClick(e) {
    orca.commands.invokeCommand('core.goForward');
}



// ———————————————————————————————————————————————————————退出菜单事件———————————————————————————————————————————————————————

/**
 * 处理关闭弹窗事件（ESC键或点击）
 * @param {KeyboardEvent|MouseEvent} e - 键盘或鼠标事件对象
 * @returns {void}
 */
function handleClosePopup(e) {
    if (currentPopup) {
        // 如果是键盘事件，检查是否为ESC键
        if (e.type === 'keydown' && e.key !== 'Escape') {
            return;
        }
        
        // 如果点击的元素包含data-backforward-block-id属性，执行特定逻辑
        const targetElement = e.target.closest('[data-backforward-block-id]');
        if (e.type === 'click' && targetElement) {
            const blockId = targetElement.getAttribute('data-backforward-block-id');
            const view = targetElement.getAttribute('data-backforward-view');
            if (view === 'journal') {
                orca.nav.goTo(view, {date: new Date(blockId)});
            } else {
                orca.nav.goTo(view, {blockId: blockId});
            }
        } 

        // 关闭弹窗
        currentPopup.remove();
        currentPopup = null;
    }
}

// ———————————————————————————————————————————————————————历史菜单项的左键item跳转———————————————————————————————————————————

/**
 * 处理headbar左键点击事件
 * @param {Event} e - 事件对象
 * @returns {void}
 */
function handleHeadbarLeftClick(e) {
    // 检查是否点击到了具有 data-backforward-block-id 的元素
    const target = e.target.closest('[data-backforward-block-id]');
    
    if (target) {
        const blockId = target.getAttribute('data-backforward-block-id');
        const view = target.getAttribute('data-backforward-view');
        if (view === 'journal') {
            orca.nav.goTo(view, {date: new Date(blockId)});
        } else {
            orca.nav.goTo(view, {blockId: blockId});
        }
    }
}


// ———————————————————————————————————————————————————————按钮右键事件———————————————————————————————————————————————————————

/**
 * 处理后退按钮右键点击事件
 * @param {Event} e - 事件对象
 * @returns {Promise<void>}
 */
async function handleBackButtonRightClick(e) {
    await handleHistoryButtonRightClick(e, 'back');
}

/**
 * 处理前进按钮右键点击事件
 * @param {Event} e - 事件对象
 * @returns {Promise<void>}
 */
async function handleForwardButtonRightClick(e) {
    await handleHistoryButtonRightClick(e, 'forward');
}


/**
 * 处理后退前进按钮右键点击事件
 * @param {Event} e - 事件对象
 * @param {string} stackType - 栈类型 ('back' 或 'forward')
 * @returns {Promise<void>}
 */
async function handleHistoryButtonRightClick(e, stackType) {
    // 判断是否已有弹窗，有则先移除
    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
    }
    
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    let stack = stackType === 'back' ? TabsmanCore.getActiveTabs()[orca.state.activePanel].backStack : TabsmanCore.getActiveTabs()[orca.state.activePanel].forwardStack;
    if ((stackType === 'back' && stack.length <= 1) || (stackType === 'forward' && stack.length === 0)) {
        orca.notify("info", `[tabsman] 当前标签页暂无${stackType === 'back' ? '后退' : '前进'}历史`);
    } else {
        // 创建弹窗
        let popupEle = document.createElement('div');
        popupEle.className = 'orca-popup plugin-tabsman-history-popup';
        popupEle.setAttribute('contenteditable', 'false');
        popupEle.style = {zIndex: 399, transformOrigin: 'center top', position: 'absolute', pointerEvents: 'auto', willChange: 'opacity, scale'};
        // 传递一个栈副本用于渲染菜单，避免修改原始栈数据
        popupEle.appendChild(await createBackForwardMenu([...stack], stackType));
        // 添加到headbar，并定位弹窗到按钮下方
        headbar.appendChild(popupEle);

        
        // 定位弹窗到按钮下方
        const buttonEle = stackType === 'back' ? backButton : forwardButton;
        const rect = buttonEle.getBoundingClientRect();
        popupEle.style.left = `${rect.left}px`;
        popupEle.style.top = "var(--orca-height-headbar)";
        
        // 保存当前弹窗引用
        currentPopup = popupEle;
    }
}


/**
 * 创建后退前进菜单
 * @param {Array} stackArrary - 栈数组
 * @param {string} stackType - 栈类型 ('back' 或 'forward')
 * @returns {HTMLElement} 返回菜单元素
 */
async function createBackForwardMenu(stackArrary, stackType) {
    // 获取栈，如果是后退栈，先弹出栈顶元素（当前块）
    let stack = stackType === 'back' ? stackArrary.slice(0, -1) : stackArrary;
    let stackItemInfoArrary = [];
    for (let i = 0; i < stack.length; i++) {
        let stackItem = stack[i];
        // 栈当前设计是越新的item index越大，越靠近站顶。
        let itemView = stackItem.view;
        let blockId = itemView === 'journal' ? stackItem.viewArgs.date : stackItem.viewArgs.blockId;
        let tabInfo = await TabsmanCore.generateTabNameAndIcon(blockId);
        stackItemInfoArrary.push({
            name: tabInfo.name,
            icon: tabInfo.icon,
            blockId: blockId,
            view: itemView
        });
    }
    
    // 创建菜单容器
    let ele = document.createElement('div');
    ele.className = 'orca-menu';

    if (stackType === 'back') {
        stackItemInfoArrary.reverse();
    }
    // 创建菜单项
    for (let i = 0; i < stackItemInfoArrary.length; i++) {
        let stackItemInfo = stackItemInfoArrary[i];
        let menuItem = createMenuItem(stackItemInfo);
        ele.appendChild(menuItem); // 添加到菜单中
    }

    return ele;
}


/**
 * 创建后退前进菜单项
 * @param {Object} stackItemInfo - 栈项信息
 * @returns {HTMLElement} 返回菜单项元素
 */
function createMenuItem(stackItemInfo) {

    // 创建 orca-menu-text（item容器）
    let ele = document.createElement('div');
    ele.className = 'orca-menu-text';
    
    // 创建图标
    let icon = document.createElement('i');
    icon.className = `${stackItemInfo.icon} orca-menu-text-icon orca-menu-text-pre`;
    icon.setAttribute('data-backforward-view', stackItemInfo.view);
    icon.setAttribute('data-backforward-block-id', stackItemInfo.blockId);

    // 创建 orca-menu-text-text（内容元素）
    let textText = document.createElement('div');
    textText.className = 'orca-menu-text-text';
    textText.innerText = stackItemInfo.name;
    textText.style = {fontFamily: 'var(--orca-fontfamily-code)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '20em', flex: 1};
    textText.setAttribute('data-backforward-block-id', stackItemInfo.blockId);
    textText.setAttribute('data-backforward-view', stackItemInfo.view);
    
    ele.appendChild(icon);
    ele.appendChild(textText);

    return ele;
}

export { startbackforwardbutton, stopbackforwardbutton };