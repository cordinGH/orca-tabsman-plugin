import * as TabsmanCore from './tabsman-core.js';

let orcaBackButton = document.querySelector('.orca-button.orca-headbar-back');
let orcaForwardButton = document.querySelector('.orca-button.orca-headbar-back+.orca-button');
let backButton = orcaBackButton.cloneNode(true);
let forwardButton = orcaForwardButton.cloneNode(true);
let headbar = document.querySelector('#headbar');
let currentPopup = null;

const createDomWithClass = window.pluginTabsman.createDomWithClass
const closePopupwithAnimation = window.pluginTabsman.closePopupwithAnimation

// 历史菜单
let backForwardMenu = null
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
    if (!backForwardMenu) {
        backForwardMenu = document.createElement('div')
        backForwardMenu.className = 'orca-menu plugin-tabsman-history-menu'
    }
    // backForwardMenu.addEventListener('click', handleHistoryItemClick);
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
    backForwardMenu.removeEventListener('click', handleHistoryItemClick);

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
            const target = e.target.closest('.plugin-tabsman-history-item')
            if (target) {
                const index = target.getAttribute('data-tabsman-history-item-index')
                const view = target.getAttribute('data-tabsman-history-item-view')
                orca.nav.goTo(view, stackItemInfoArrary[index].viewArgs)
            }
        }

        // 关闭弹窗
        if (needClose) {
            await closePopupwithAnimation(currentPopup)
            currentPopup = null;
            // 移除关闭弹窗事件监听器
            document.removeEventListener('keydown', handleClosePopup);
            document.removeEventListener('pointerdown', handleClosePopup);
        }
    }
}

// ———————————————————————————————————————————————————————历史菜单项的左键item跳转———————————————————————————————————————————

/**
 * 处理headbar左键点击事件
 * @param {Event} e - 事件对象
 * @returns {void}
 */
function handleHistoryItemClick(e) {
    // 检查是否点击到了具有 plugin-tabsman-history-item 的元素
    const target = e.target.closest('.plugin-tabsman-history-item');
    console.log(target)
    if (target) {
        const view = target.getAttribute('data-tabsman-history-item-view');
        const index = target.getAttribute('data-tabsman-history-item-index');
        // const viewArgs = target.getAttribute('data-tabsman-history-item-view-args');
        console.log("检查单击item最终弹出的args：", stackItemInfoArrary[index].viewArgs)
        orca.nav.goTo(view, stackItemInfoArrary[index].viewArgs)
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
    // 传递栈副本用于渲染菜单，避免修改原始栈数组
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

    // tips：关闭成功后会移除监听，不占用开支
    document.addEventListener('keydown', handleClosePopup);
    document.addEventListener('pointerdown', handleClosePopup);
}


/**
 * 创建后退前进菜单
 * @param {Array} stackArrary - 栈数组
 * @param {string} stackType - 栈类型 ('back' 或 'forward')
 * @returns {Promise<HTMLElement>} 返回菜单元素
 */
let stackItemInfoArrary = []
async function createBackForwardMenu(stackArrary, stackType) {
    // 创建菜单容器
    backForwardMenu.textContent = ''
    backForwardMenu.style.cssText = ''
    
    if ((stackType === 'back' && stackArrary.length <= 1) ||  (stackType === 'forward' && stackArrary.length == 0)){
        backForwardMenu.textContent = `暂无${stackType === 'back' ? '后退' : '前进'}历史`
        Object.assign(backForwardMenu.style, {color: "var(--orca-color-gray-5)", textAlign: "center"})
        return backForwardMenu;
    }

    stackItemInfoArrary.length = 0
    // 获取栈，如果是后退栈，先弹出栈顶元素（当前块）
    let stack = stackType === 'back' ? stackArrary.slice(0, -1) : stackArrary;
    for (const stackItem of stack) {
        // 栈当前设计是越新的item index越大，越靠近站顶
        const {view, viewArgs} = stackItem
        // 第三方插件的视图以插件自己的panel.view作为当前块id
        let blockId = ""
        switch (view) {
            case 'journal': blockId = viewArgs.date; break;
            case 'block': blockId = viewArgs.blockId; break;
            default: blockId = "插件视图：" + view;
        }
        // let blockId = itemView === 'journal' ? stackItem.viewArgs.date : stackItem.viewArgs.blockId;
        let {name, icon} = await TabsmanCore.generateTabNameAndIcon(blockId);
        stackItemInfoArrary.push({name, icon, view, viewArgs})
    }

    if (stackType === 'back') {
        stackItemInfoArrary.reverse();
    }
    // 创建菜单项
    for (let i = 0; i < stackItemInfoArrary.length; i++) {
        let stackItemInfo = stackItemInfoArrary[i];
        let menuItem = createMenuItem(stackItemInfo, i);
        backForwardMenu.appendChild(menuItem); // 添加到菜单中
    }

    return backForwardMenu;
}


/**
 * 创建后退前进菜单项
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
    // item.setAttribute('data-tabsman-history-item-view-args', stackItemInfo.viewArgs);
    
    // 创建图标
    const icon = createDomWithClass("i", `${stackItemInfo.icon} orca-menu-text-icon orca-menu-text-pre`, item)

    // 创建 orca-menu-text-text（内容元素）
    const textText = createDomWithClass("div", 'orca-menu-text-text', item)
    textText.innerText = stackItemInfo.name;
    Object.assign(textText.style, {fontFamily: 'var(--orca-fontfamily-code)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '20em'})

    return item;
}

export { startbackforwardbutton, stopbackforwardbutton };