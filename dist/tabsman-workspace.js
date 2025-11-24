const orcaHeadbarSidebarTools = document.querySelector(".orca-headbar-sidebar-tools")
const header = document.querySelector('#headbar')

/** @type {HTMLInputElement} */
let saveButton = null

/** @type {HTMLInputElement} */
let exitButton = null

/** @type {HTMLInputElement} */
let wsItems = null

/** @type {HTMLInputElement} */
let wsTools = null

/** @type {HTMLInputElement} */
let confirmPopup = null

/** @type {HTMLInputElement} */
let savePopup = null
let savePopupExist = false

/** @type {HTMLInputElement} */
let wsItemSelected = null

let wsItemsObj = {}
// let hasExit = false

/**
 * 【工具函数】创建一个指定类名的 DOM 元素并追加到父元素中
 * @param {string} eName - 标签名，如 'div', 'button'
 * @param {string} eClassName - 类名
 * @param {HTMLElement} parentE - 需要append进去的父元素
 * @returns {HTMLElement} 创建的元素
 */
function createDomWithClass (eName, eClassName, parentE) {
    const e = document.createElement(eName)
    e.className = eClassName
    parentE.appendChild(e)
    return e
}


// 启动初始渲染
export async function startWSRender() {
    // 创建固定元素，保存按钮和WS容器
    wsTools = createDomWithClass("div", "plugin-tabsman-ws", orcaHeadbarSidebarTools)
    saveButton = createDomWithClass("button", "plugin-tabsman-ws-save orca-button plain", wsTools)
    createDomWithClass("i", "ti ti-device-floppy orca-headbar-icon", saveButton)
    wsItems = createDomWithClass("div", "plugin-tabsman-ws-items", wsTools)

    // 提取用户的工作区
    const allUserWS = await window.getAllWS()
    // const allUserWS = allWS.filter(item => item !== "tabsman-workspace-exit")

    // 创建userWS（选项卡）
    for(const name of allUserWS){
        appendWSItemEle(name)
    }

    // ws工具栏监听委托
    wsTools.addEventListener("click", async function (e) {
        e.stopPropagation()
        const target = e.target
        const classList = target.classList
        if (classList.contains("plugin-tabsman-ws-items-item")) {
            if (wsItemSelected) clearWSItemSelected()
            wsItemSelected = target
            openWSByClickEle(target.dataset.pluginTabsmanWsName)
            wsItemSelected.classList.add("plugin-tabsman-ws-selected")
            return
        } else if (classList.contains("plugin-tabsman-ws-items-item-delete")) {
            const wsName = target.closest(".plugin-tabsman-ws-items-item").dataset.pluginTabsmanWsName
            getConfirmPopup()
            confirmPopup.result = wsName
            // 定位弹窗到按钮下方
            const rect = target.getBoundingClientRect();
            confirmPopup.style.left = `${rect.left}px`;
            confirmPopup.style.top = "var(--orca-height-headbar)";
            return
        } else if (target.closest(".plugin-tabsman-ws-exit")) {
            window.exitWS()
            exitButton.remove()
            clearWSItemSelected()
            return
        } else if (target.closest(".plugin-tabsman-ws-save")) {
            getSavePopup()
            const rect = target.getBoundingClientRect();
            savePopup.style.left = `${rect.left}px`;
            savePopup.style.top = "var(--orca-height-headbar)";
        }
    })

    // 监听保存弹窗的关闭事件
    document.addEventListener('keydown', closeSavePopup);
    document.addEventListener('click', closeSavePopup);

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
function appendWSItemEle(name) {
    const wsItem = createDomWithClass("div", "plugin-tabsman-ws-items-item orca-segmented-item", wsItems)
    wsItem.dataset.pluginTabsmanWsName = name
    wsItem.textContent = name.slice(name.indexOf('_') + 1)
    createDomWithClass("i", "ti ti-x plugin-tabsman-ws-items-item-delete", wsItem)
    wsItemsObj[name] = wsItem
}

// 点击元素打开工作区
function openWSByClickEle(name) {
    window.openWS(name)

    // 确保存在退出点如果还没有退出点元素则先建立
    if (!exitButton) {
        // 创建退出退出点的按钮，并使得点击时清除dom并重置缓存
        exitButton = createDomWithClass("button", "plugin-tabsman-ws-exit orca-button plain", wsTools)
        createDomWithClass("i", "ti ti-plug-x orca-headbar-icon", exitButton)
    } else {
        wsTools.appendChild(exitButton)
    }
}

// 获取确认窗对象，确认窗result保存处理的wsName
async function getConfirmPopup() {
    if (confirmPopup) {
        headbar.appendChild(confirmPopup)
        return
    }

    // 创建确认窗口
    confirmPopup = createDomWithClass("div", 'orca-popup', headbar)
    confirmPopup.style = {zIndex: 299, transformOrigin: 'center bottom', position: 'absolute', pointerEvents: 'auto', willChange: 'opacity, scale'};

    // 弹窗的内容盒子
    const confirmBox = createDomWithClass("div", 'orca-menu orca-context-menu orca-confirm-box', confirmPopup)

    const confirmBoxMessage = createDomWithClass("div", 'orca-confirm-box-message', confirmBox)
    const confirmBoxMessageI = createDomWithClass("i", 'ti ti-alert-circle orca-confirm-box-icon', confirmBoxMessage)
    const confirmBoxMessageText = createDomWithClass("p", 'orca-confirm-box-text', confirmBoxMessage)
    confirmBoxMessageText.textContent = "请确认你要删除这个工作区！"
    const noBtn = createDomWithClass("div", 'orca-button outline', confirmBox)
    noBtn.textContent = "取消"
    const yesBtn = createDomWithClass("div", 'orca-button dangerous', confirmBox)
    yesBtn.textContent = "确认"
    noBtn.onclick = () => {
        confirmPopup.remove()
    };
    yesBtn.onclick = async function(){
        confirmPopup.remove()
        const wsName = confirmPopup.result

        // 如果删除的是当前工作区，则先移除退出按钮和样式
        const deleteKind = await window.deleteWS(wsName)
        if ( deleteKind === 1) {
            exitButton.remove()
            clearWSItemSelected()
        }
        removeWSItemEle(wsName)
    };
}

// 获取保存窗对象，result属性为获取的name
async function getSavePopup() {
    savePopupExist = true
    if (savePopup) {
        headbar.appendChild(savePopup)
        return
    }

    // 创建确认窗口
    savePopup = createDomWithClass("div", 'orca-popup plugin-tabsman-ws-save_popup', headbar)
    savePopup.style = {zIndex: 299, transformOrigin: 'center bottom', position: 'absolute', pointerEvents: 'auto', willChange: 'opacity, scale'};

    // 弹窗的内容盒子
    const saveInputBox = createDomWithClass("div", 'orca-menu orca-context-menu orca-input-box', savePopup)
    const input = createDomWithClass("span", 'orca-input', saveInputBox)
    const inputInput = createDomWithClass("span", 'orca-input-input', input)
    const inputInputI = createDomWithClass("i", 'ti ti-forms orca-input-box-icon orca-input-pre', inputInput)
    const inputActualinput = createDomWithClass("input", 'orca-input-actualinput', inputInput)
    inputActualinput.placeholder = "请为新工作区命名..."
    inputActualinput.type = "text"

    const yesBtn = createDomWithClass("button", 'orca-button solid', saveInputBox)
    yesBtn.textContent = "确定"
    yesBtn.style = "color: var(--orca-color-white);"

    // 提示已存在
    const inputError = createDomWithClass("span", 'orca-input-error', input)
    inputError.remove()
    inputError.textContent = "命名已存在，请重新命名。"
    
    yesBtn.onclick = async function (){
        const inputValue = inputActualinput.value
        savePopup.result = inputValue
        const saveReturn = await window.saveWS(inputValue)
        if (saveReturn) {
            savePopup.remove()
            savePopupExist = false
            inputActualinput.value = ""
            appendWSItemEle(saveReturn)
        } else {
            input.classList.add("orca-input-has-error")
            input.appendChild(inputError)
        }
    };
}

function closeSavePopup(e) {
    if (savePopupExist) {
        // 如果是键盘esc则重置处理
        let needClose = false
        if (e.type === 'keydown' && e.key === 'Escape') {
            needClose = true
        }

        const targetElement = e.target.closest('.plugin-tabsman-ws-save_popup');
        if (e.type === 'click' && !targetElement) {
            needClose = true
        }

        if (needClose) {
            savePopup.remove()
            savePopupExist = false
        }
    }
}