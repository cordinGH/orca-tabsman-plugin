import * as Utils from './tabsman-utils.js'
import * as TabsmanCore from './tabsman-core.js'

/** @type {HTMLInputElement} */
let saveButton = null

/** @type {HTMLInputElement} */
let exitButton = null

/** @type {HTMLElement} 选项卡 */
let wsItems = null

/** @type {HTMLElement} 工作区顶部工具栏（选项卡 + 保存 + 退出） */
let wsTools = null

// 插件栏元素和虎鲸headerbar
let userTools = document.querySelector('#headbar>.orca-headbar-user-tools')
let headbar = document.getElementById('headbar')

/** @type {HTMLElement} 确认窗口 */
let confirmPopup = null

/** @type {HTMLElement} 保存窗口 */
let savePopup = null

/** @type {HTMLElement}  当前被打开的工作区（元素）*/
let wsItemSelected = null

let wsItemsObj = {}

const {createDomWithClass, closePopupwithAnimation} = Utils

// 启动初始渲染
export async function startWSRender() {
    // 创建固定元素，保存按钮和WS容器
    const orcaHeadbarSidebarTools = document.querySelector(".orca-headbar-sidebar-tools")

    wsTools = createDomWithClass("div", "plugin-tabsman-ws", orcaHeadbarSidebarTools)
    saveButton = createDomWithClass("button", "plugin-tabsman-ws-save orca-button plain", wsTools)
    createDomWithClass("i", "ti ti-device-floppy orca-headbar-icon", saveButton)
    wsItems = createDomWithClass("div", "plugin-tabsman-ws-items", wsTools)

    // 提取用户的工作区
    const allUserWS = await TabsmanCore.getAllWorkspace()
    // const allUserWS = allWS.filter(item => item !== "tabsman-workspace-exit")

    // 创建userWS（选项卡）
    const fragment = document.createDocumentFragment()
    for(const name of allUserWS){
        appendWSItemEle(name, fragment)
    }
    wsItems.appendChild(fragment)

    // ws工具栏监听委托
    wsTools.addEventListener("pointerdown", async function (e) {
        const target = e.target
        const {classList} = target
        if (target.classList.contains("plugin-tabsman-ws-items-item")) {
            openWSByClickEle(target)
        } else if (classList.contains("plugin-tabsman-ws-items-item-delete")) {
            // 连接状态下，当再次点击关闭时，由于可能是想关闭其他工作区，因此应当先清理掉弹窗。
            // 这种情况下先前挂在document上的关闭监听就不能再处理了。否则执行栈会出bug导致弹窗秒开秒关，具体的执行栈原因分析见笔记date260423
            // 简单说就是，不阻止冒泡的话 下方remove成功移除打开新弹窗后，会先去执行冒泡上去的document监听关窗，然后才会执行新窗的滞后挂载，这个监听挂载就一直留在这了，导致第三次打开秒开秒关.
            if (confirmPopup?.isConnected) {
                e.stopPropagation()  
                await removePopup(confirmPopup)
            }
            openDeletePopupByClickEle(target.closest(".plugin-tabsman-ws-items-item"))

        } else if (target.closest(".plugin-tabsman-ws-exit")) {
            exitWSByClickEle()

        } else if (target.closest(".plugin-tabsman-ws-save")) {
            // 连接状态下，document上挂载了关闭监听，无需处理
            if (savePopup?.isConnected) return;
            Utils.hideTooltip()
            openSavePopupByClickEle()
        }
    })

    saveButton.onmouseenter = () => Utils.showTooltip(saveButton, '保存为新工作区')
    saveButton.onmouseleave = () => Utils.hideTooltip()
}

export function stopWSRender(){
    wsTools?.remove()
    if (confirmPopup?.isConnected) {
        document.removeEventListener('pointerdown', handleConfirmPopupClose)
        document.removeEventListener('keydown', handleConfirmPopupClose)
    }
    if (savePopup?.isConnected) {
        document.removeEventListener('pointerdown', handleSavePopupClose)
        document.removeEventListener('keydown', handleSavePopupClose)
    }
    wsTools = null
    saveButton = null
    exitButton = null
    wsItems = null
    confirmPopup = null
    savePopup = null
    wsItemSelected = null
    wsItemsObj = {}
    userTools = null
    headbar = null
}


// 工具函数，移除选中样式和选中元素记录
function clearWSItemSelected() {
    wsItemSelected.classList.remove("plugin-tabsman-ws-selected")
    wsItemSelected = null
}

// 移除工作区元素
function removeWSItemEle(name) {
    const wsItem = wsItemsObj[name]

    // 移除元素数据
    wsItem.remove()
    delete wsItemsObj[name]

    // 如果移除的当前工作区，则清除class并重置selected元素。
    if (wsItem === wsItemSelected) clearWSItemSelected()
}

// 添加工作区元素
function appendWSItemEle(name, container = wsItems) {
    const wsItem = createDomWithClass("div", "plugin-tabsman-ws-items-item orca-segmented-item", container)
    wsItem.dataset.pluginTabsmanWsName = name
    wsItem.textContent = name.slice(name.indexOf('_') + 1)
    createDomWithClass("i", "ti ti-x plugin-tabsman-ws-items-item-delete", wsItem)
    wsItemsObj[name] = wsItem
    return wsItem
}


/**
 * 点击元素打开工作区
 * @param {HTMLElement} wsItem 需要打开的目标工作区
 */
function openWSByClickEle(wsItem) {

    if (wsItemSelected) clearWSItemSelected();
    wsItemSelected = wsItem
    const name = wsItemSelected.dataset.pluginTabsmanWsName
    wsItemSelected.classList.add("plugin-tabsman-ws-selected")
    TabsmanCore.openWorkspace(name)

    // 确保存在退出点如果还没有退出点元素则先建立
    if (!exitButton) {
        // 创建退出退出点的按钮，并使得点击时清除dom并重置缓存
        exitButton = createDomWithClass("button", "plugin-tabsman-ws-exit orca-button plain", wsTools)
        createDomWithClass("i", "ti ti-plug-x orca-headbar-icon", exitButton)
    } else {
        wsTools.appendChild(exitButton)
    }
}


/**
 * 点击打开删除工作区的弹窗
 * @param {HTMLElement} wsItem 需要打开的目标工作区
 */
async function openDeletePopupByClickEle(wsItem) {

    // 加入DOM并监听关闭触发
    appendConfirmPopup()

    setTimeout(() => {
        document.addEventListener('pointerdown', handleConfirmPopupClose);
        document.addEventListener('keydown', handleConfirmPopupClose);
    }, 0)

    // 记录目标工作区名字
    const wsName = wsItem.dataset.pluginTabsmanWsName
    confirmPopup.result = wsName

    // 定位弹窗到按钮下方
    Utils.setPopupPosition(confirmPopup, wsItem)
    document.body.classList.add('orca-popup-pointer-logic')
    headbar.classList.add('plugin-tabsman-popup-open')
}


/**
 * 点击退出工作区
 */
function exitWSByClickEle() {
    TabsmanCore.exitWorkspace()
    exitButton.remove()
    clearWSItemSelected()
}

/**
 * 点击打开保存工作区的弹窗
 */
function openSavePopupByClickEle() {

    // 加入DOM并监听关闭触发
    appendSavePopup()
    
    // 确保焦点触发。
    setTimeout(() => {
        document.addEventListener('pointerdown', handleSavePopupClose);
        document.addEventListener('keydown', handleSavePopupClose);
        savePopup.inputActualinput.focus()
    }, 0);

    Utils.setPopupPosition(savePopup, saveButton)
    document.body.classList.add('orca-popup-pointer-logic')
    headbar.classList.add('plugin-tabsman-popup-open')
}


// 获取确认窗对象，确认窗result保存处理的wsName
function appendConfirmPopup() {
    if (confirmPopup) {
        headbar.appendChild(confirmPopup)
        return
    }

    // 创建确认窗口
    confirmPopup = document.createElement('div')
    confirmPopup.className = 'orca-popup plugin-tabsman-ws-confirm_popup'
    Object.assign(confirmPopup.style, { zIndex: '299', transformOrigin: 'left top' });

    // 弹窗的内容盒子
    const confirmBox = createDomWithClass("div", 'orca-menu orca-context-menu orca-confirm-box', confirmPopup)
    confirmBox.innerHTML = '<div class="orca-confirm-box-message"><i class="ti ti-alert-circle orca-confirm-box-icon"></i><p class="orca-confirm-box-text">请确认你要删除这个工作区！</p></div>'
    
    const noBtn = createDomWithClass("div", 'orca-button outline', confirmBox)
    noBtn.textContent = "取消"
    const yesBtn = createDomWithClass("div", 'orca-button dangerous', confirmBox)
    yesBtn.textContent = "确认"
    noBtn.onclick = () => removePopup(confirmPopup)
    yesBtn.onclick = () => {
        const wsName = confirmPopup.result
        removePopup(confirmPopup)
        TabsmanCore.deleteWorkspace(wsName).then((deleteKind) => {
            // 删除活跃工作区会返回1，需要移除按钮并清理选中
            if ( deleteKind === 1) {
                exitButton.remove()
                clearWSItemSelected()
            }
            removeWSItemEle(wsName)
        })
    };

    headbar.appendChild(confirmPopup)
}

// 获取保存窗对象，result属性为获取的name
function appendSavePopup() {
    if (savePopup && !savePopup.isConnected) {
        headbar.appendChild(savePopup)
        return
    }

    // 创建save弹窗
    savePopup = document.createElement('div')
    savePopup.className = 'orca-popup plugin-tabsman-ws-save_popup'
    Object.assign(savePopup.style, { zIndex: '299', transformOrigin: 'left top' });

    // 弹窗的命名输入区
    const saveInputBox = createDomWithClass("div", 'orca-menu orca-context-menu orca-input-box', savePopup)

    const input = createDomWithClass("span", 'orca-input', saveInputBox)
    savePopup.input = input

    const inputInput = createDomWithClass("span", 'orca-input-input', input)
    inputInput.innerHTML = '<i class="ti ti-forms orca-input-box-icon orca-input-pre"></i>'

    const inputActualinput = createDomWithClass("input", 'orca-input-actualinput', inputInput)
    savePopup.inputActualinput = inputActualinput
    inputActualinput.placeholder = "请为新工作区命名..."
    inputActualinput.type = "text"

    // 选项按钮，选择是否仅保存当前tab
    const optionDiv = createDomWithClass("div", 'plugin-tabsman-ws-save_popup-option', saveInputBox)
    optionDiv.textContent = "仅保存当前Tab"
    Object.assign(optionDiv.style, {
        display: "flex",
        justifyContent: "space-between"
    })
    const extendBtn = createDomWithClass("button", "orca-switch", optionDiv)
    extendBtn.innerHTML = '<span class="orca-switch-toggle"></span>'
    savePopup.extendBtn = extendBtn
    savePopup.onlyActiveTab = false

    // 确认按钮
    const yesBtn = createDomWithClass("button", 'orca-button solid', saveInputBox)
    yesBtn.textContent = "确定"
    yesBtn.style.color = "var(--orca-color-white)"

    // 提示高频重复创建
    const inputError = createDomWithClass("span", 'orca-input-error', input)
    savePopup.inputError = inputError
    inputError.remove()
    inputError.textContent = "1毫秒内创建多次？emmm"

    extendBtn.onclick = () => savePopup.onlyActiveTab = savePopup.extendBtn.classList.toggle('orca-switch-on')

    yesBtn.onclick = async () => {
        const inputValue = savePopup.inputActualinput.value
        
        // 未填写默认采用日期作为命名
        if (inputValue === "") {
            const dateToday = new Date()
            savePopup.result = String(dateToday.getMonth() + 1) + "-" + dateToday.getDate()
        } else {
            savePopup.result = inputValue
        }

        const saveReturn = await TabsmanCore.saveWorkspace(savePopup.result, savePopup.onlyActiveTab, false)

        if (saveReturn) {
            // 清空输入框内容
            savePopup.inputActualinput.value = ""
            removePopup(savePopup)
            
            // 添加后如果使得顶部栏空间溢出，则自动删除并提示UI空间不足。
            const baseRight = userTools.getBoundingClientRect().right
            const wsItem = appendWSItemEle(saveReturn)
            const wsItemsRight = wsItem.getBoundingClientRect().right;
            const { left: userToolsLeft, right: newRight } = userTools.getBoundingClientRect();

            // 如果挤压了userTools，使得right变大说明溢出了，防止浮点误差，提供1px误差。 或者userToolsLeft和item重叠，也说明溢出
            if (newRight -1 > baseRight || userToolsLeft < wsItemsRight) {
                removeWSItemEle(saveReturn)
                await TabsmanCore.deleteWorkspace(saveReturn, false)
                orca.notify("warn", "[tabsman] 顶部栏UI空间不足，请拉宽窗口或删除一些工作区。");
                return;
            }

            orca.notify("success", "[tabsman]新工作区创建成功！");

        } else {
            savePopup.input.classList.add("orca-input-has-error")
            savePopup.input.appendChild(savePopup.inputError)
        }
    };

    headbar.appendChild(savePopup)
}


async function handleConfirmPopupClose(e) {
    if (!confirmPopup.isConnected) return
    // 键盘esc或者是点在了confirmPopup以外的元素，则移除popup
    const shouldClose = (e.type === 'keydown' && e.key === 'Escape') || (e.type === 'pointerdown' && !confirmPopup.contains(e.target))
    shouldClose && removePopup(confirmPopup)
}

async function handleSavePopupClose(e) {
    // 该回调只在appendSavePopup执行后才追加回调，因此savePopup是必然存在的
    if (!savePopup.isConnected) return
    const shouldClose = (e.type === 'keydown' && e.key === 'Escape') || (e.type === 'pointerdown' && !savePopup.contains(e.target))
    shouldClose && removePopup(savePopup)
}

// 从dom中移除弹窗，同时一并移除监听器
async function removePopup (popupEle){
    await closePopupwithAnimation(popupEle)
    document.body.classList.remove('orca-popup-pointer-logic')
    headbar.classList.remove('plugin-tabsman-popup-open')
    if (popupEle === savePopup) {
        document.removeEventListener('pointerdown', handleSavePopupClose)
        document.removeEventListener('keydown', handleSavePopupClose)
        // 恢复按钮
        if(savePopup.onlyActiveTab) {
            savePopup.extendBtn.classList.toggle('orca-switch-on')
            savePopup.onlyActiveTab = false
        }
    }
    if (popupEle === confirmPopup) {
        document.removeEventListener('pointerdown', handleConfirmPopupClose)
        document.removeEventListener('keydown', handleConfirmPopupClose)
    }
}