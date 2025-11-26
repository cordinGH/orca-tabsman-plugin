import * as TabsmanCore from './tabsman-core.js';

let orcaBackButton = document.querySelector('.orca-button.orca-headbar-back');
let orcaForwardButton = document.querySelector('.orca-button.orca-headbar-back+.orca-button');
let backButton = orcaBackButton.cloneNode(true);
let forwardButton = orcaForwardButton.cloneNode(true);
let headbar = document.querySelector('#headbar');
let currentPopup = null;

const createDomWithClass = window.pluginTabsman.createDomWithClass
const closePopupwithAnimation = window.pluginTabsman.closePopupwithAnimation

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
    backButton.addEventListener('contextmenu', handleHistoryButtonRightClick);
    forwardButton.addEventListener('contextmenu', handleHistoryButtonRightClick);
    
    // 监听新创建的按钮（左键触发）
    backButton.addEventListener('click', handleBackButtonLeftClick);
    forwardButton.addEventListener('click', handleForwardButtonLeftClick);

    // 注册item点击跳转
    headbar.addEventListener('click', handleHeadbarLeftClick);
}


/**
 * 停止后退前进按钮模块
 * @returns {void}
 */
function stopbackforwardbutton() {
    // 移除新按钮的事件监听器
    backButton.removeEventListener('contextmenu', handleHistoryButtonRightClick);
    forwardButton.removeEventListener('contextmenu', handleHistoryButtonRightClick);
    backButton.removeEventListener('click', handleBackButtonLeftClick);
    forwardButton.removeEventListener('click', handleForwardButtonLeftClick);
    
    // 移除headbar的事件监听器
    headbar.removeEventListener('click', handleHeadbarLeftClick);

    // 恢复原始按钮
    backButton.replaceWith(orcaBackButton);
    forwardButton.replaceWith(orcaForwardButton);
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
async function handleClosePopup(e) {
    if (currentPopup) {
        // 如果是键盘事件，检查是否为ESC键
        let needClose = false
        if (e.type === 'keydown' && e.key === 'Escape') {
            needClose = true
        }
        
        // 如果点击的元素包含data-tabsman-backforward-block-id属性，执行特定逻辑
        if (e.type === 'pointerdown'){
            needClose = true
            const targetElement = e.target.closest('[data-tabsman-backforward-block-id]')
            if (targetElement) {
                const blockId = targetElement.getAttribute('data-tabsman-backforward-block-id')
                const view = targetElement.getAttribute('data-tabsman-backforward-view')
                if (view === 'journal') {
                    orca.nav.goTo(view, {date: new Date(blockId)})
                } else {
                    orca.nav.goTo(view, {blockId: blockId})
                }
            }
        }

        // 关闭弹窗
        if (needClose) {
            await closePopupwithAnimation(currentPopup)
            currentPopup = null;
            // 移除关闭弹窗事件监听器
            document.removeEventListener('keydown', handleClosePopup);
            document.removeEventListener('pointerdown', handleClosePopup);
            // orca.notify("success", "[tabsman] 移除历史菜单监听");
        }
    }
}

// ———————————————————————————————————————————————————————历史菜单项的左键item跳转———————————————————————————————————————————

/**
 * 处理headbar左键点击事件
 * @param {Event} e - 事件对象
 * @returns {void}
 */
function handleHeadbarLeftClick(e) {
    // 检查是否点击到了具有 data-tabsman-backforward-block-id 的元素
    const target = e.target.closest('[data-tabsman-backforward-block-id]');
    
    if (target) {
        const blockId = target.getAttribute('data-tabsman-backforward-block-id');
        const view = target.getAttribute('data-tabsman-backforward-view');
        if (view === 'journal') {
            orca.nav.goTo(view, {date: new Date(blockId)});
        } else {
            orca.nav.goTo(view, {blockId: blockId});
        }
    }
}


// ———————————————————————————————————————————————————————按钮右键事件———————————————————————————————————————————————————————

/**
 * 处理后退前进按钮右键点击事件
 * @param {Event} e - 事件对象
 * @param {string} stackType - 栈类型 ('back' 或 'forward')
 * @returns {Promise<void>}
 */
async function handleHistoryButtonRightClick(e) {
    // 判断是否已有弹窗，有则先移除
    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
    }
    
    // e.preventDefault();
    // e.stopPropagation();
    // e.stopImmediatePropagation();

    const stackType = backButton.contains(e.target)? "back" : "forward"
    let stack = stackType === 'back' ? TabsmanCore.getActiveTabs()[orca.state.activePanel].backStack : TabsmanCore.getActiveTabs()[orca.state.activePanel].forwardStack;
    // 创建弹窗
    let popupEle = document.createElement('div');
    popupEle.className = 'orca-popup plugin-tabsman-history-popup';
    popupEle.setAttribute('contenteditable', 'false');
    Object.assign(popupEle.style, { zIndex: '399', transformOrigin: 'left top' });
    // 传递栈副本用于渲染菜单，避免修改原始栈数据
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

    // 移除关闭弹窗事件监听器
    document.addEventListener('keydown', handleClosePopup);
    document.addEventListener('pointerdown', handleClosePopup);
    // orca.notify("success", "[tabsman] 添加历史菜单监听");
}


/**
 * 创建后退前进菜单
 * @param {Array} stackArrary - 栈数组
 * @param {string} stackType - 栈类型 ('back' 或 'forward')
 * @returns {Promise<HTMLElement>} 返回菜单元素
 */
async function createBackForwardMenu(stackArrary, stackType) {
    // 创建菜单容器
    let ele = document.createElement('div');
    ele.className = 'orca-menu';
    if ((stackType === 'back' && stackArrary.length <= 1) ||  (stackType === 'forward' && stackArrary.length == 0)){
        ele.textContent = `暂无${stackType === 'back' ? '后退' : '前进'}历史`
        Object.assign(ele.style, {color: "var(--orca-color-gray-5)", textAlign: "center"})
        return ele;
    }

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
    const icon = createDomWithClass("i", `${stackItemInfo.icon} orca-menu-text-icon orca-menu-text-pre`, ele)
    icon.setAttribute('data-tabsman-backforward-view', stackItemInfo.view);
    icon.setAttribute('data-tabsman-backforward-block-id', stackItemInfo.blockId);

    // 创建 orca-menu-text-text（内容元素）
    const textText = createDomWithClass("div", 'orca-menu-text-text', ele)
    textText.innerText = stackItemInfo.name;
    Object.assign(textText.style, {fontFamily: 'var(--orca-fontfamily-code)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '20em'})
    textText.setAttribute('data-tabsman-backforward-block-id', stackItemInfo.blockId);
    textText.setAttribute('data-tabsman-backforward-view', stackItemInfo.view);

    return ele;
}

export { startbackforwardbutton, stopbackforwardbutton };